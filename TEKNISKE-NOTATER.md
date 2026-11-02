# Tekniske notater

- Kjører i nettleser.
- Lagrer i local storage.
- React.

## Slik det er satt opp nå

- Vite og TypeScript. Start med `npm run dev`, bygg med `npm run build`.
- Språkvalget lagres i local storage under nøkkelen `curve.language`.
- Tekstene ligger i `src/i18n.ts`.

## Input

- Koden ligger i `src/input` og bygger på React Flow (`@xyflow/react`).
- Boksene lagres i local storage under nøkkelen `curve.boxes`.
- Inntekt kobles til Trekk, OTP eller Folketrygden, og Trekk til Konto. `toScenario` i `boxes.ts` gjør boksene om til det simuleringen leser.
- Avkastning og standardavvik ligger foreløpig inne i kortene til Konto og OTP.
- G-boksen er statisk: Den har ingen connector, og OTP og Folketrygden leser fra den. Den finnes så lenge en av dem finnes.
- Boksen Deg selv er også statisk og står alltid på lerretet. Med fødselsår viser grafene alder i stedet for årstall, og periodevalget får Til 95 år. Fødselsåret ligger bare i local storage.

## Simulering

- Alle beløp er i dagens kroner, og avkastning og G-vekst er reelle, altså utover prisveksten. Da er et fast beløp automatisk inflasjonsjustert. Unntaket er skatt på ASK, som regnes av nominell gevinst.
- Koden ligger i `src/simulation`.
- Simuleringen går dag for dag, og hver boks slår inn på sitt eget intervall.
- OTP er en konto. Hver utbetaling av lønn setter inn sin del av årets innskudd, som er 5 % av lønn opp til 7,1 G og 10 % mellom 7,1 og 12 G. Satsene kan endres i kortet. Her brukes G fra 1. mai.
- En ASK-konto følger med på innskuddene, og det som overstiger dem skattes. Skatten regnes av nominell gevinst, så innskuddene mister verdi med inflasjonen i regnestykket. Skjermingsfradrag er ikke med. Foreløpig vises bare hva som er igjen hvis alt tas ut på slutten, siden det ikke finnes uttak ennå.
- Alle bokser i et pass følger samme G-bane, og lønnen følger G.
- Folketrygden er en beregnet beholdning og ikke penger, så den skal ikke summeres med sparing. Hver 1. mai reguleres den med G-veksten. Hver 31. desember legges forrige års opptjening til, som er 18,1 % av lønn opp til 7,1 ganger gjennomsnittlig G. Lønnen følger G.
- Den tykke streken er fasit og skal alltid være medianen. Derfor er ikke dette ren Monte Carlo: Hvert pass har et speilbilde på motsatt side av fasit (`fasit² / verdi`), så det ligger like mange pass over som under.
