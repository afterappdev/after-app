# Publicação VIP — aviso push (contrato API)

Fuso autoritativo: **America/Sao_Paulo**. Horários oficiais: **11:00** e **17:00**.

## Contrato preferencial (clientes novos)

`POST /banners` com `vipPublications`:

```json
{
  "vipPublications": [
    { "date": "YYYY-MM-DD", "pushTiming": "IMMEDIATE" },
    { "date": "YYYY-MM-DD", "pushTiming": "SLOT_11" },
    { "date": "YYYY-MM-DD", "pushTiming": "SLOT_17" }
  ]
}
```

- Um item por dia VIP; `pushTiming` validado no servidor para cada `date`.
- `IMMEDIATE` só é permitido no **mesmo dia civil** em SP, após 17:00 (inclusive).
- Nos instantes **11:00:00** e **17:00:00** em SP, slots já encerrados não são oferecidos (sem evento retroativo).
- `vipDates` pode acompanhar `vipPublications` desde que liste **exatamente** os mesmos dias.

## Compatibilidade legada (descontinuação futura)

Clientes antigos enviam apenas `vipDates` (sem `vipPublications`).

- A publicação VIP **continua** (débito de crédito VIP, exibição na Home).
- `BannerSchedule.vipPushTiming` permanece **null**.
- O planejamento de push usa o caminho legado de `planPromoPushEvents`: **até um evento por slot** configurado em `PROMO_PUSH_VIP_SLOT_TIMES` (comportamento anterior à escolha explícita de horário).
- **Risco:** se o ambiente tiver dois slots oficiais configurados, o cliente legado pode gerar **até dois pushes** no mesmo dia VIP (não duplica débito; idempotência por `(schedule, slot)`).
- Não atribuímos `IMMEDIATE` nem `SLOT_*` silenciosamente a clientes legados.

Payloads inválidos (distintos do legado):

- `vipPublications: []` com `vipDates` preenchido → **400**
- `vipDates` e `vipPublications` com conjuntos de datas diferentes → **400**
- `vipPublications` com horário indisponível para a data → **400**

## Consulta de opções

`GET /banners/vip-push-options?dates=YYYY-MM-DD,YYYY-MM-DD`

- `byDate`: opções **por data** (usar na UI multidata).
- `options`: interseção global (compatibilidade; não usar para bloquear multidata).
