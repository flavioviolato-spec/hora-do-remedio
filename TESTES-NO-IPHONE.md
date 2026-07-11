# Checklist de testes no iPhone — Hora do Remédio

> Para usar antes de considerar uma versão "pronta de verdade". Automatizado
> (jest) já garante a lógica; isto aqui garante o que só o aparelho real
> mostra: som tocando, alarme no modo silencioso, permissões do iOS.
>
> Marque `[x]` conforme for testando. Se algo falhar, anote o que aconteceu
> (em vez do esperado) para eu investigar.

## 1. Instalação e permissão

- [ ] Instalei/atualizei o app pelo AltStore (Refresh All) sem erro
- [ ] Ao abrir pela 1ª vez (ou depois de reinstalar), o iOS pediu permissão de alarme
      em português, explicando o motivo — texto de `NSAlarmKitUsageDescription`
- [ ] Toquei em "Permitir" e a tela de Ajustes mostra "Alarme de verdade ativo (AlarmKit)"

## 2. Cadastro de remédio

- [ ] Tirar foto da caixinha funciona (câmera)
- [ ] Escolher foto da galeria também funciona
- [ ] Nome com acentuação e "ç" salva certo (ex.: "Solução de Ibuprofeno")
- [ ] Adicionar 2+ horários no mesmo remédio funciona
- [ ] Duração por preset (5/7/10/14/30 dias) e pelo ajuste manual (+/-) funcionam
- [ ] Início "Hoje" e "Amanhã" funcionam
- [ ] Escolher um som na seção "Som do alarme" e tocar "Ouvir" toca o som certo
      (confira os 4: Sino, Suave, Urgente, Eletrônico — nenhum toca o som errado)
- [ ] Salvar volta pra Home e o remédio aparece na lista

## 3. O alarme toca de verdade (o requisito mais importante)

Cadastre um remédio de teste com horário poucos minutos à frente para cada caso:

- [ ] **iPhone no modo SILENCIOSO** (chavinha lateral) — o alarme toca mesmo assim
- [ ] **Com um Foco ativado** (ex.: Não Perturbe) — o alarme toca mesmo assim
- [ ] **App fechado e tela bloqueada** — o alarme toca em tela cheia
- [ ] **App aberto na tela** — o alarme toca normalmente
- [ ] O nome do remédio aparece no alarme
- [ ] Botão "Tomei" para o alarme
- [ ] Botão "Adiar" espera 10 minutos e toca de novo

## 4. Editar e excluir

- [ ] Editar o horário de um remédio: o alarme do horário ANTIGO some e o do
      horário NOVO passa a tocar (teste com um horário próximo)
- [ ] Pausar um remédio (switch "Lembretes ativos"): o alarme dele para de tocar
- [ ] Reativar o switch: o alarme volta a tocar
- [ ] Excluir um remédio: some da lista, do histórico, e não toca mais alarme dele

## 5. Fim do tratamento

- [ ] Um remédio com duração de 1 dia, cadastrado hoje: depois de amanhã não tem
      mais dose na lista "Hoje" nem alarme agendado

## 6. Sobrevive a reiniciar o iPhone

- [ ] Cadastre um remédio com alarme para daqui a poucos minutos, **reinicie o
      iPhone** (desligar e ligar), e confirme que o alarme ainda toca no horário
      (o AlarmKit é do sistema operacional — não depende do app estar rodando)

## 7. Histórico de doses

- [ ] Marcar uma dose como "tomada" na Home mostra a animação (anel + confetes)
- [ ] Fechar e abrir o app de novo: a marcação continua lá (não voltou pra "não tomada")
- [ ] Abrir o histórico do remédio (toque no card) mostra a grade dias × horários
      com a dose marcada certa
- [ ] Desmarcar uma dose (tocar de novo) volta ao estado "não tomada", sem animação

## 8. Avisos na tela

- [ ] Se a permissão de alarme for negada (Ajustes do iPhone → Hora do Remédio →
      Alarmes → desligar), a Home mostra o banner "Alarmes desligados"
- [ ] Perto de vencer a instalação do AltStore (2 dias ou menos), a Home mostra
      o banner "Expira em N dias" / "Expira amanhã" — e em Ajustes aparece a
      data certa de validade

## 9. Vários remédios ao mesmo tempo

- [ ] Cadastre 2+ remédios com horários diferentes: cada um toca na hora certa,
      sem misturar nome/som
- [ ] Cadastre 2 remédios no MESMO horário: os dois tocam (não só um)

## 10. Leitura do nome pela foto (OCR)

- [ ] Fotografe uma caixinha de genérico com nome em duas linhas (ex.:
      "cloridrato de ..."): o nome vem COMPLETO, sem o laboratório do topo
- [ ] Aparece "Lendo o nome da caixinha…" enquanto processa
- [ ] Foto borrada / sem texto: nada é preenchido, sem erro na tela
- [ ] Se você já digitou um nome, a leitura NÃO sobrescreve

## 11. Sugestão de Tratamento

- [ ] Digite "dipirona" no nome e toque fora do campo: "Tratamento" sugere
      "Dor e febre" (só se estava vazio)
- [ ] Salve um remédio com um tratamento SEU (ex.: "Enxaqueca"); exclua-o;
      cadastre de novo com o mesmo nome: a sugestão é o SEU tratamento
- [ ] A sugestão nunca sobrescreve um tratamento já preenchido

## 12. Estoque de comprimidos

- [ ] Cadastre com "Comprimidos na caixa" = 5: o card mostra "5 comprimidos restantes"
- [ ] Marque uma dose: vira 4; desmarque: volta a 5
- [ ] Com estoque baixo (≤ 2 dias de doses), o aviso fica vermelho ("Acabando…")
- [ ] Com estoque 0: "Comprimidos acabaram — reponha a caixa"
- [ ] Remédio sem estoque informado: nenhum aviso aparece (como antes)
- [ ] Editar o remédio e mudar/limpar o estoque funciona

## 13. Relatório para consulta

- [ ] Na tela de histórico, "Compartilhar relatório" abre a janela do iOS com o
      texto (nome, período, % de adesão, grade por dia)
- [ ] Cancelar a janela não mostra nenhum erro

## 14. Backup e restauração

- [ ] Ajustes → "Fazer backup": a janela de compartilhar abre; salve no
      Arquivos/Drive e confira que o arquivo .json existe
- [ ] "Restaurar backup" com o arquivo salvo: mostra a confirmação com a
      contagem certa de remédios/doses; ao confirmar, tudo volta
- [ ] Após restaurar, os alarmes continuam tocando (reconciliação automática)
- [ ] As fotos NÃO voltam no backup (esperado — aparece o ícone de comprimidos
      no lugar; é só tirar a foto de novo se quiser)
- [ ] Escolher um arquivo qualquer (não-backup): "Arquivo inválido", sem travar

---

**Resultado geral:** ⬜ Tudo certo | ⬜ Achei problema(s) — descrever abaixo

<!-- Espaço para anotações do Flavio durante o teste -->
