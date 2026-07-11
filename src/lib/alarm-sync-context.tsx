/**
 * Liga o reconciliador de alarmes (alarmSync) ao ciclo de vida do app:
 * roda quando os remédios carregam/mudam (cobre início e todo CRUD, já
 * que medicines-context troca a referência da lista a cada gravação) e
 * sempre que o app volta ao primeiro plano. Expõe se a permissão do
 * AlarmKit foi negada ou se algum alarme falhou ao agendar, para a Home
 * mostrar um aviso com atalho.
 *
 * Não precisa de controle de concorrência aqui: reconcileAlarms já é
 * serializada por AlarmPort (ver alarmSync.ts) — chamadas simultâneas se
 * enfileiram sozinhas.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { getAlarmPort } from './alarm';
import { reconcileAlarms } from './alarmSync';
import { useMedicines } from './medicines-context';

type AlarmSyncContextValue = {
  permissionDenied: boolean;
  schedulingFailed: boolean;
};

const DEFAULT_STATUS: AlarmSyncContextValue = { permissionDenied: false, schedulingFailed: false };

const AlarmSyncContext = createContext<AlarmSyncContextValue>(DEFAULT_STATUS);

export function AlarmSyncProvider({ children }: { children: ReactNode }) {
  const { medicines, loading } = useMedicines();
  const [status, setStatus] = useState<AlarmSyncContextValue>(DEFAULT_STATUS);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;

    async function sync() {
      try {
        const result = await reconcileAlarms(getAlarmPort(), medicines);
        if (cancelled || result.status === 'skipped-imminent') return;
        setStatus({
          permissionDenied: result.status === 'permission-denied',
          schedulingFailed: result.status === 'partial-failure',
        });
      } catch (error) {
        // Mensagem truncada por precaução: pode vir de um módulo nativo de
        // terceiros que, em tese, incluísse o título do alarme nela.
        const message = error instanceof Error ? error.message.slice(0, 120) : 'erro desconhecido';
        console.warn('[alarmSync] reconciliação falhou:', message);
        // Erro inesperado (não um resultado tratado de reconcileAlarms) não
        // pode ficar só no console — ninguém olha o console de um app de
        // celular. Sem isto, o banner "Alarmes desligados" nunca apareceria
        // e a pessoa acharia que está tudo certo, quando pode não estar.
        if (!cancelled) setStatus({ permissionDenied: false, schedulingFailed: true });
      }
    }

    sync();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [medicines, loading]);

  return <AlarmSyncContext.Provider value={status}>{children}</AlarmSyncContext.Provider>;
}

export function useAlarmSyncStatus(): AlarmSyncContextValue {
  return useContext(AlarmSyncContext);
}
