/**
 * QA de acompanhamento (ceticismo total) sobre a correção do defeito
 * "remédio novo com horário iminente nunca agendado" em alarmSync.ts
 * (lastScheduledKeys / dailyKey / fixedKey — ver reconcileOnce).
 *
 * Investiga 3 cenários levantados como possíveis efeitos colaterais da
 * correção:
 *  (a) editar o horário de um remédio que já tem alarme agendado, para um
 *      horário que fica iminente na hora da edição;
 *  (b) dois remédios diferentes no MESMO horário, um já agendado e outro
 *      não;
 *  (c) excluir um remédio: a proteção "iminente" fica "presa" achando que
 *      o alarme excluído ainda está agendado?
 */

import { describe, expect, it } from '@jest/globals';

import type {
  AlarmAuthorization,
  AlarmPort,
  DailyAlarmRequest,
  FixedAlarmRequest,
} from '../alarm/port';
import { reconcileAlarms } from '../alarmSync';
import type { Medicine } from '../types';

function makeMedicine(overrides: Partial<Medicine> = {}): Medicine {
  return {
    id: 'med-1',
    name: 'Remédio Teste 500mg',
    photoUri: null,
    times: ['08:00'],
    startDate: '2026-07-10',
    durationDays: 7,
    soundId: 'classico',
    active: true,
    createdAt: '2026-07-10T09:00:00.000Z',
    ...overrides,
  };
}

class FakeAlarmPort implements AlarmPort {
  scheduled: { kind: 'daily' | 'fixed'; medicineId: string; time?: string }[] = [];
  stopAllCalls = 0;
  authorization: AlarmAuthorization = 'authorized';

  isAvailable(): boolean {
    return false;
  }
  async getAuthorization(): Promise<AlarmAuthorization> {
    return this.authorization;
  }
  async requestAuthorization(): Promise<AlarmAuthorization> {
    return this.authorization;
  }
  async scheduleDailyAlarm(req: DailyAlarmRequest): Promise<string> {
    this.scheduled.push({ kind: 'daily', medicineId: req.medicineId, time: req.time });
    return `daily-${this.scheduled.length}`;
  }
  async scheduleFixedAlarm(req: FixedAlarmRequest): Promise<string> {
    this.scheduled.push({ kind: 'fixed', medicineId: req.medicineId });
    return `fixed-${this.scheduled.length}`;
  }
  async stopAlarm(): Promise<void> {}
  async stopAllAlarms(): Promise<void> {
    this.stopAllCalls++;
    this.scheduled = [];
  }
}

describe('(a) editar horário de remédio já agendado para um horário que fica iminente', () => {
  it('o NOVO horário (nunca agendado com essa chave) é agendado na hora, não fica preso', async () => {
    const port = new FakeAlarmPort();
    // 08:00 já agendado de manhã cedo (bem longe, não iminente).
    const original = makeMedicine({ times: ['08:00'] });
    const pre = await reconcileAlarms(port, [original], new Date('2026-07-10T06:00:00'));
    expect(pre).toEqual({ status: 'ok', dailyCount: 1, futureCount: 0 });

    // Usuário edita o horário para "10:01", e agora são 10:00 (1 min de
    // diferença — dentro da janela de 2 min). A CHAVE muda (mesmo medicineId,
    // horário diferente) — dailyKey("med-1","10:01") nunca foi agendada.
    const editado = makeMedicine({ times: ['10:01'] });
    const result = await reconcileAlarms(port, [editado], new Date('2026-07-10T10:00:00'));

    expect(result).toEqual({ status: 'ok', dailyCount: 1, futureCount: 0 });
    expect(port.scheduled).toEqual([{ kind: 'daily', medicineId: 'med-1', time: '10:01' }]);
  });

  it('o horário ANTIGO (08:00) é substituído/cancelado pela edição, mesmo que só reste ele na lista de "agendados de verdade" antes da rodada — comportamento esperado (o usuário pediu outro horário, não é para o alarme antigo continuar tocando)', async () => {
    const port = new FakeAlarmPort();
    const original = makeMedicine({ times: ['08:00'] });
    await reconcileAlarms(port, [original], new Date('2026-07-10T06:00:00'));
    expect(port.scheduled).toEqual([{ kind: 'daily', medicineId: 'med-1', time: '08:00' }]);

    const editado = makeMedicine({ times: ['10:01'] });
    await reconcileAlarms(port, [editado], new Date('2026-07-10T10:00:00'));

    // Só o horário novo permanece — o antigo não fica "fantasma" duplicado.
    expect(port.scheduled).toEqual([{ kind: 'daily', medicineId: 'med-1', time: '10:01' }]);
    expect(port.stopAllCalls).toBe(2);
  });

  it('editar um CAMPO que NÃO é o horário (ex.: nome) mantendo o horário igual: a proteção "iminente" continua funcionando normalmente (chave não muda)', async () => {
    const port = new FakeAlarmPort();
    const original = makeMedicine({ times: ['10:02'], name: 'Nome Antigo' });
    const pre = await reconcileAlarms(port, [original], new Date('2026-07-10T09:00:00'));
    expect(pre).toEqual({ status: 'ok', dailyCount: 1, futureCount: 0 });

    // Edita só o nome, horário continua "10:02" — agora a 2 min de disparar.
    const editado = makeMedicine({ times: ['10:02'], name: 'Nome Novo' });
    const result = await reconcileAlarms(port, [editado], new Date('2026-07-10T10:00:00'));

    expect(result).toEqual({ status: 'skipped-imminent' });
    expect(port.stopAllCalls).toBe(1); // não mexeu de novo — alarme antigo (nome velho) continua tocando no horário certo
  });
});

describe('(b) dois remédios diferentes no MESMO horário, um já agendado (iminente) e outro novo', () => {
  it('achado: a reconciliação inteira fica bloqueada ("skipped-imminent") por causa do remédio JÁ agendado — o remédio NOVO no mesmo horário também não é criado nesta rodada', async () => {
    const port = new FakeAlarmPort();
    const medA = makeMedicine({ id: 'a', times: ['10:02'] });

    // Só "a" existe e já está agendado (bem cedo, não iminente ainda).
    const pre = await reconcileAlarms(port, [medA], new Date('2026-07-10T09:00:00'));
    expect(pre).toEqual({ status: 'ok', dailyCount: 1, futureCount: 0 });

    // Usuário cadastra "b" com o MESMO horário "10:02". Agora são 10:00 —
    // "a@10:02" (já agendado) está a 2 min de disparar.
    const medB = makeMedicine({ id: 'b', times: ['10:02'] });
    const result = await reconcileAlarms(port, [medA, medB], new Date('2026-07-10T10:00:00'));

    // A reconciliação inteira é pulada — inclusive "b", que nunca foi
    // agendado antes e não tinha nada a proteger. Isso é uma limitação
    // inerente ao modelo "cancela tudo e reagenda tudo" (não dá para tocar
    // só "b" sem também tocar "a"), NÃO uma regressão nova desta correção —
    // já existia antes, e a correção até reduziu o alcance (antes bastava
    // QUALQUER horário desejado ser iminente, mesmo sem nunca ter sido
    // agendado; agora só bloqueia se algo JÁ agendado for afetado).
    expect(result).toEqual({ status: 'skipped-imminent' });
    // Nada foi tocado nesta chamada: "a@10:02" continua sendo o único
    // alarme real (o da rodada "pre") — "b" nunca chegou a ser agendado.
    expect(port.scheduled).toEqual([{ kind: 'daily', medicineId: 'a', time: '10:02' }]);
    expect(port.stopAllCalls).toBe(1); // só a rodada do "pre" mexeu

    // Consequência prática: "b" só será agendado quando "a@10:02" deixar de
    // ser iminente (depois de tocar, vira "amanhã" — mais de 2 min de novo)
    // e uma nova reconciliação rodar (próxima abertura do app, por exemplo).
    const depois = await reconcileAlarms(port, [medA, medB], new Date('2026-07-10T10:03:00'));
    expect(depois).toEqual({ status: 'ok', dailyCount: 2, futureCount: 0 });
  });
});

describe('(c) excluir remédio: a proteção "iminente" não fica presa em alarme que não existe mais', () => {
  it('depois de excluir o remédio e uma reconciliação bem-sucedida rodar, a chave antiga SAI de lastScheduledKeys — cadastrar remédio novo no mesmo horário funciona normalmente, mesmo que o horário seja iminente', async () => {
    const port = new FakeAlarmPort();
    const excluido = makeMedicine({ id: 'vai-sair', times: ['10:02'] });

    // "vai-sair@10:02" fica agendado de verdade.
    const pre = await reconcileAlarms(port, [excluido], new Date('2026-07-10T09:00:00'));
    expect(pre).toEqual({ status: 'ok', dailyCount: 1, futureCount: 0 });

    // Usuário EXCLUI o remédio (a reconciliação seguinte roda com a lista
    // sem ele) num horário em que "10:02" NÃO é mais iminente ainda —
    // precisa terminar com sucesso para lastScheduledKeys ser reconstruído.
    const posExclusao = await reconcileAlarms(port, [], new Date('2026-07-10T09:30:00'));
    expect(posExclusao).toEqual({ status: 'ok', dailyCount: 0, futureCount: 0 });
    expect(port.scheduled).toEqual([]);

    // Agora, às 10:00, cadastra um remédio NOVO (id diferente) com o MESMO
    // horário "10:02" (2 min de distância, dentro da janela). Se
    // lastScheduledKeys tivesse ficado "preso" com a chave antiga
    // ("daily:vai-sair:10:02"), isso não afetaria a chave nova de qualquer
    // forma (a chave inclui o id) — o teste prova que não há bloqueio
    // nenhum, nem por acidente.
    const novo = makeMedicine({ id: 'recem-cadastrado', times: ['10:02'] });
    const result = await reconcileAlarms(port, [novo], new Date('2026-07-10T10:00:00'));

    expect(result).toEqual({ status: 'ok', dailyCount: 1, futureCount: 0 });
    expect(port.scheduled).toEqual([{ kind: 'daily', medicineId: 'recem-cadastrado', time: '10:02' }]);
  });

  it('se a reconciliação da EXCLUSÃO for pulada por "iminente" (por causa de outro remédio), o alarme excluído continua de fato agendado no port até a próxima rodada bem-sucedida — consistente com a realidade, não é um estado "preso" incorreto', async () => {
    const port = new FakeAlarmPort();
    const excluido = makeMedicine({ id: 'vai-sair', times: ['08:00'] });
    const outro = makeMedicine({ id: 'outro', times: ['10:02'] });

    const pre = await reconcileAlarms(port, [excluido, outro], new Date('2026-07-10T09:00:00'));
    expect(pre).toEqual({ status: 'ok', dailyCount: 2, futureCount: 0 });

    // Exclui "vai-sair", mas "outro@10:02" (já agendado) está a 2 min de
    // disparar — a reconciliação inteira (que refletiria a exclusão) é pulada.
    const tentaExcluir = await reconcileAlarms(port, [outro], new Date('2026-07-10T10:00:00'));
    expect(tentaExcluir).toEqual({ status: 'skipped-imminent' });

    // Nada foi tocado: o alarme do remédio excluído AINDA está no port,
    // porque a reconciliação que o removeria nunca chegou a rodar de
    // verdade. Isso é esperado (reflete a realidade do AlarmKit), mas
    // significa que o remédio excluído pode disparar mais uma vez.
    expect(port.scheduled).toContainEqual({ kind: 'daily', medicineId: 'vai-sair', time: '08:00' });

    // Depois que "outro@10:02" deixa de ser iminente, a próxima
    // reconciliação finalmente aplica a exclusão.
    const depois = await reconcileAlarms(port, [outro], new Date('2026-07-10T10:03:00'));
    expect(depois).toEqual({ status: 'ok', dailyCount: 1, futureCount: 0 });
    expect(port.scheduled).toEqual([{ kind: 'daily', medicineId: 'outro', time: '10:02' }]);
  });
});
