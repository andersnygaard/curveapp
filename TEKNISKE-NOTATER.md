# Tekniske notater

- Kjører i nettleser.
- Lagrer i local storage.
- React, Vite og TypeScript. Start med `npm run dev`, test med `npm test` og bygg med `npm run build`.
- Tekstene ligger i `src/i18n.ts`. Valg av språk, tema og om planen er åpen lagres under `curve.language`, `curve.theme` og `curve.planOpen`, og `curve.tourSeen` husker at omvisningen er vist.
- Oppbyggingen av koden, reglene for den og en ordliste står i `CLAUDE.md`.

## Input

- Koden ligger i `src/input` og bygger på React Flow (`@xyflow/react`). Boksene som data ligger i `src/model`, med én fil per bokstype i `src/model/boxes`.
- Boksene lagres under nøkkelen `curve.boxes`, med versjonsnummer. Eldre lagring bygges om i `src/model/migrations.ts`, og det som ikke kan leses tas vare på under `curve.boxes.backup` og varsles på skjermen.
- Ledninger finnes i tre typer. Penger flytter kroner. Påvirkning endrer en verdi uten at pengene kommer fra en annen boks. Grunnlag leser bare et tall.
- Prikkene på kortene har ulik form, og bare like former kan kobles. Hvilke bokser som kan kobles til hva står i filen til bokstypen.
- Inntekt er netto utbetalt. Pensjonsgrunnlag er et eget felt, siden OTP og alderspensjonen regnes av brutto.
- Avkastning er en egen boks. Kontoer på samme boks følger samme marked, og kontoer på hver sin boks følger hvert sitt.
- G-boksen og boksen Deg selv er statiske og har ingen connector. Det har heller ikke Bolig og Formuesskatt, siden de teller alle bokser av sin type. G står på lerretet så lenge det står en OTP- eller alderspensjonsboks der, og Deg selv står alltid der. Fødselsåret ligger bare i nettleseren og i filer du lagrer selv.
- Planen åpnes med knappen Plan og står ved siden av begge fanene, eller over siden på en smal skjerm. Den oppdateres mens du tegner. Den regnes i en egen Web Worker (`src/simulation/plan.worker.ts`) av `src/model/plan.ts`, som kjører ett pass uten tilfeldigheter og leser hva motoren faktisk flyttet. Den sier derfor det samme som simuleringen, og en ny bokstype kommer med av seg selv. Linjer som skatt, pensjon og overskudd kjenner planen igjen på navn som står der reglene lages, i `src/engine/rules.ts` og `src/engine/norway.ts`. Et trekk føres under id-en til boksen og ikke navnet du skrev, så et navn kan ikke leses som skatt.
- Planen viser en linje når noe starter, endrer seg eller stopper, og en endring må være på mer enn 10 % og mer enn 500 kr. Beløp som følger G holder seg på én linje, og utbetalinger under 100 kr tas ikke med. Formuesskatten får én linje så lenge den varer, med laveste og høyeste beløp, siden den endrer seg hvert år uten at noe er bestemt.

## Simulering

- Motoren ligger i `src/engine` og kjenner bare beholdninger, faktorer og regler. Den går dag for dag, i sju faste faser: faktorer (markedene og G), regulering og opptjening av beregnede beholdninger som alderspensjonen, avkastning, inntekt, utbetaling, trekk og dagens slutt. Skatten på pensjon regnes etter utbetalingene. I trekkfasen går trekk fra en konto og uttak, og formuesskatten går sist. Dagens slutt flytter ingen penger. Der regnes skjermingen, og så mister innskuddene en dag til inflasjonen.
- Simuleringen kjører i en Web Worker (`src/simulation/simulation.worker.ts`), så skjermen aldri venter på den.
- Alle beløp er i dagens kroner, og avkastning og G-vekst er reelle, altså utover prisveksten. Da er et fast beløp automatisk inflasjonsjustert. Unntaket er skatt på ASK, som regnes av nominell gevinst. Avkastningen som oppgis er medianen, altså den geometriske veksten, så gjennomsnittet blir litt høyere når markedet svinger.
- Den tykke streken er den ekte medianen av alle passene, opptil 2 000. De kommer i par med motsatte tilfeldige tall, så medianen settler raskt. Den første utgaven kommer etter 200 pass og blir skarpere etter hvert. Y-aksen settes av den første og ligger fast.
- Tilfeldighetene er faste for hver markedsboks og for G, som har sin egen strøm. Samme oppsett gir samme tall hver gang, og endrer du noe annet enn markedet, følger passene samme marked som før. Forskjellen du ser kommer da av endringen.
- All pengeflyt går gjennom ett sted (`World.move`), så regnskapet alltid går opp. En konto kan ikke gå under 0, og det som ikke kunne betales telles. Andelen som holder er pass der ingenting manglet, og den rundes ned, så 100 % betyr at alle passene holdt.
- Penger er framme før noe trekkes samme dag, og det som trekker fra en konto går etter det som fyller den. Mellom de to betyr rekkefølgen boksene ble laget i derfor ingenting. Den avgjør bare hvem som får først når to uttak eller trekk tar fra samme konto samme dag og kontoen ikke har nok til begge.
- Alder regnes som årstall minus fødselsår, og en halv betyr 1. juli, så en alder kan oppgis på måneden.
- En konto finnes ikke før startdatoen, så grafen starter der. Simuleringen starter på den tidligste startdatoen blant kontoer, OTP og alderspensjon.

### Bokstypene i simuleringen

- Inntekt er penger og kan ikke brukes to ganger. Trekk går først, og det som er igjen går til en connector uten fast beløp. Det ingen tar regnes som brukt.
- Hver inntekt har Fra alder og Til alder. Tomt felt betyr fra starten eller ut hele perioden, og uten fødselsår løper inntekten hele perioden. OTP og alderspensjonen tjener bare opp mens inntekten løper.
- Budsjett trekker linjene sine fra inntekten og sender resten videre. Regnestykket gjøres over året, så kvartalsvis inntekt sparer like mye som samme penger månedlig.
- OTP er en konto. Hver utbetaling av lønn setter inn sin del av årets innskudd, som er 5 % av pensjonsgrunnlaget opp til 7,1 G og 10 % mellom 7,1 og 12 G. Satsene kan endres på boksen. Her brukes G fra 1. mai. Utbetalingen regnes ut på nytt hvert år med forventet avkastning fra avkastningsboksen som er koblet til, så beløpet følger markedet og kontoen tømmes ved slutten. Den skattes som pensjon.
- Alderspensjonen (fra folketrygden) er en beregnet beholdning og ikke penger, så den skal ikke summeres med sparing. Hver 1. mai reguleres den med G-veksten. Hver 31. desember legges forrige års opptjening til, som er 18,1 % av pensjonsgrunnlaget opp til 7,1 ganger gjennomsnittlig G. Fra utbetalingsalderen stopper streken, og pensjonen er beholdningen delt på delingstallet. Tomt delingstall gir et anslag. Pensjonen ligger fast i dagens kroner fra første utbetaling, og den skattes som pensjon.
- Skatt på pensjon regnes per person, på all pensjon samlet, som om månedens utbetaling varte hele året. Den har minstefradrag, personfradrag, skatt på alminnelig inntekt, trinnskatt, trygdeavgift og skattefradrag for pensjonsinntekt. Bare alderspensjonen gir fradraget, men all pensjon teller når det trappes ned. Skatten trekkes der pensjonen ble betalt inn. Pensjon som ikke er koblet videre teller med i satsen, men skatten trekkes ikke. Lønn er ikke med, så pensjon ved siden av jobb får for lav skatt.
- Uttak dekker et behov i kroner eller prosent fra en startalder. Pensjon og inntekt teller først, det som mangler tas fra kontoene etter størrelse, og det som er til overs går videre. Et beløp i kroner er etter skatt, og skatten kommer i tillegg. En prosent er før skatt, og skatten tas av den. Prosenten regnes av det kontoene har når uttaket starter, eller den første måneden etterpå at de har noe, og beløpet ligger fast etter det.
- En inntekt kan kobles rett til Uttak. Den er allerede netto, så den får ingen pensjonsskatt. Uttak gjøres opp hver måned, så en årlig inntekt dekker bare måneden den kommer, og resten går videre som overskudd. Det samme gjelder inntekt før Uttak starter.
- En ASK-konto følger med på innskuddene og skjermingen. Skatten regnes av nominell gevinst, så begge mister verdi med inflasjonen i regnestykket. Hver 31. desember gir laveste innskuddssaldo i året og ubrukt skjerming skjermingsrenten, og det som ikke brukes tas med videre. Et uttak regnes først som innskudd, så som skjerming, og bare det som går ut over dem skattes. Skatten tas av uttaket og av det som betaler formuesskatten, så det trekkes mer for å dekke et beløp etter skatt. En vanlig konto har ingen skatt på gevinst her.
- Alle bokser i et pass følger samme G-bane, og pensjonsgrunnlaget følger G. Netto inntekt ligger fast i dagens kroner.
- Bolig flytter ingen penger og blir ingenting i motoren. Lånet går jevnt ned fra starten til datoen, og det er bare formuesskatten og planen som leser det.
- Formuesskatt er en boks uten connector, og det kan bare være én. Den regnes hver 31. desember av det hvert pass har på kontoene den dagen. ASK teller 80 % og vanlig konto 100 %. Primærbolig, sekundærbolig og hytte teller etter egne satser, mens OTP og alderspensjonen holdes utenfor. Lån fordeles etter verdi, og delen som faller på en ASK trekkes med 80 %. Den tas fra kontoene etter størrelse, med skatt på gevinst, etter alt annet som trekkes den dagen. Det kontoene ikke dekker blir stående ubetalt uten gjeld. Oppsett uten boksen regner som før, så det er ved å slette den at skatten slås av.

## Ikke kontrollert

Reglene for alderspensjonen og OTP bygger på utregningen i AND-59 og AND-60. De er ikke kontrollert mot Nav eller avtalen hos Storebrand, og skattesatsen på ASK, 37,84 %, er ikke kontrollert hos Skatteetaten. Delingstallene er anslag.

Skatt på pensjon bygger på satsene for 2026, og hver måned regnes som om utbetalingen varte hele året. Den er ikke sjekket i Skatteetatens kalkulator. G er 136 549 kr fra 1. mai 2026, og skjermingsrenten står på 3,6 %, som var satsen for 2025. Den settes etter hvert år, så det den blir fremover er en antagelse. Begge kan endres på boksen sin.

Formuesskatten bygger på satsene for 2026 i AND-96, og eksemplene er regnet for hånd og ikke sjekket i Skatteetatens kalkulator. Det er ikke bekreftet at OTP og alderspensjonen holdes utenfor, at lån på hytte trekkes fullt ut, at grensen på 14 mill. kr gjelder per bolig eller at bankinnskudd alltid teller 100 %. Skatten betales i virkeligheten året etter, og hytte teller her det høyeste den kan.
