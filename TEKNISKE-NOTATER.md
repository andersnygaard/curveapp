# Tekniske notater

- Kjører i nettleser.
- Lagrer i local storage.
- React, Vite og TypeScript. Start med `npm run dev`, test med `npm test` og bygg med `npm run build`.
- Tekstene ligger i `src/i18n.ts`, og språkvalget lagres under nøkkelen `curve.language`.
- Oppbyggingen av koden og reglene for den står i `CLAUDE.md`.

## Input

- Koden ligger i `src/input` og bygger på React Flow (`@xyflow/react`). Boksene som data ligger i `src/model`, med én fil per bokstype i `src/model/boxes`.
- Boksene lagres under nøkkelen `curve.boxes`, med versjonsnummer. Eldre lagring bygges om i `src/model/migrations.ts`, og det som ikke kan leses tas vare på under `curve.boxes.backup` og varsles på skjermen.
- Ledninger finnes i tre typer. Penger flytter kroner. Påvirkning endrer en verdi uten at pengene kommer fra en annen boks. Grunnlag leser bare et tall.
- Kontaktene har ulik form, og bare like former kan kobles. Hvilke bokser som kan kobles til hva står i filen til bokstypen.
- Inntekt er netto utbetalt. Pensjonsgrunnlag er et eget felt, siden OTP og Folketrygden regnes av brutto.
- Avkastning er en egen boks. Kontoer på samme boks følger samme marked, og kontoer på hver sin boks følger hvert sitt.
- G-boksen og boksen Deg selv er statiske og har ingen connector. G finnes så lenge noe leser den, og Deg selv står alltid på lerretet. Fødselsår og alder du slutter å jobbe ved ligger bare i local storage.

## Simulering

- Motoren ligger i `src/engine` og kjenner bare beholdninger, faktorer og regler. Den går dag for dag, i faste faser: faktorer, regulering, avkastning, pengeflyt og gater.
- Simuleringen kjører i en Web Worker (`src/simulation/simulation.worker.ts`), så skjermen aldri venter på den.
- Alle beløp er i dagens kroner, og avkastning og G-vekst er reelle, altså utover prisveksten. Da er et fast beløp automatisk inflasjonsjustert. Unntaket er skatt på ASK, som regnes av nominell gevinst.
- Den tykke streken er den ekte medianen av alle passene, opptil 2 000. De kommer i par med motsatte tilfeldige tall, så medianen settler raskt. Den første utgaven kommer etter 200 pass og blir skarpere etter hvert. Y-aksen settes av den første og ligger fast.
- Tilfeldighetene er faste for hver markedsboks. Samme oppsett gir samme tall hver gang, og endrer du noe annet enn markedet, følger passene samme marked som før. Forskjellen du ser kommer da av endringen.
- All pengeflyt går gjennom ett sted (`World.move`), så regnskapet alltid går opp. En konto kan ikke gå under 0, og det som ikke kunne betales telles. Andelen som holder er pass der ingenting manglet, og den rundes ned, så 100 % betyr at alle passene holdt.
- Penger er framme før noe trekkes samme dag, og det som trekker fra en konto går etter det som fyller den. Rekkefølgen boksene ble laget i betyr derfor ingenting.
- Alder regnes som årstall minus fødselsår, og en halv betyr 1. juli, så en alder kan oppgis på måneden.
- En konto finnes ikke før startdatoen, så grafen starter der.

### Bokstypene i simuleringen

- Inntekt er penger og kan ikke brukes to ganger. Trekk går først, og det som er igjen går til en connector uten fast beløp. Det ingen tar regnes som brukt.
- Budsjett trekker linjene sine fra inntekten og sender resten videre. Regnestykket gjøres over året, så kvartalsvis inntekt sparer like mye som samme penger månedlig.
- OTP er en konto. Hver utbetaling av lønn setter inn sin del av årets innskudd, som er 5 % av pensjonsgrunnlaget opp til 7,1 G og 10 % mellom 7,1 og 12 G. Her brukes G fra 1. mai. Utbetalingen regnes ut på nytt hvert år, så beløpet følger markedet og kontoen tømmes ved slutten.
- Folketrygden er en beregnet beholdning og ikke penger, så den skal ikke summeres med sparing. Hver 1. mai reguleres den med G-veksten. Hver 31. desember legges forrige års opptjening til, som er 18,1 % av pensjonsgrunnlaget opp til 7,1 ganger gjennomsnittlig G. Fra utbetalingsalderen stopper streken, og pensjonen er beholdningen delt på delingstallet. Tomt felt gir et anslag.
- Uttak dekker et behov i kroner eller prosent fra en startalder. Pensjon teller først, det som mangler tas fra kontoene etter størrelse, og det som er til overs går videre. Prosent gjelder kontoene første dag, og beløpet ligger fast etter det. Beløpet er før skatt.
- En ASK-konto følger med på innskuddene, og det som overstiger dem skattes. Skatten regnes av nominell gevinst, så innskuddene mister verdi med inflasjonen i regnestykket. Uttak regnes først som innskudd. Skjermingsfradrag er ikke med, og skatt trekkes foreløpig ikke fra uttak.
- Alle bokser i et pass følger samme G-bane, og pensjonsgrunnlaget følger G. Netto inntekt ligger fast i dagens kroner.

## Ikke kontrollert

Reglene for Folketrygden og OTP bygger på utregningen i AND-59 og AND-60. De er ikke kontrollert mot Nav eller avtalen hos Storebrand, og skattesatsen på ASK er ikke kontrollert hos Skatteetaten. Delingstallene er anslag.
