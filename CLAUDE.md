# Curve

A simulator for saving and withdrawing, in the browser. Everything stays in local storage.

```
npm run dev     # start the app
npm test        # all tests, must stay green
npm run build   # type check and build
npm run storybook   # every component on its own
```

`npm test` runs the stories in Chromium. On a new machine, run `npx playwright install chromium` first.

Every push to `main` publishes the app: `.github/workflows/pages.yml` runs `npm test` and `npm run build`, and if they pass the site goes out on GitHub Pages at https://andersnygaard.github.io/curveapp/. It can also be started by hand under Actions.

For now, code is pushed straight to `main`, not through a branch. This is a known shortcut: we will land on a better way once the solution has stabilized.

## Architecture

Three layers. Dependencies only go downwards, and `src/architecture.test.ts` enforces it. The engine imports only from the engine, and the model imports neither React nor the screen. Neither touches the browser, except `model/storage.ts`. The engine may not quote any box type name except `'income'` and `'g'`, which are also a phase of the day and the id of the G factor.

```
src/input, src/simulation, src/components   What is on screen. React, React Flow and canvas.
src/model                                   The drawing as data. Boxes, wires, storage, compiling for the engine,
                                            the shared policies (shared.ts) and the plan (plan.ts, stretches.ts). No React.
src/engine                                  The simulation. Stocks, factors, rules and the ledger. Norwegian pension
                                            and tax law in norway.ts. No boxes, no browser.
```

- `src/engine` knows nothing of box types. It runs rules on stocks, day by day, in the seven phases listed at the top of `engine.ts`. The law the user cannot change lives in `engine/norway.ts`. Rates the user can change start from defaults in the box that holds them, such as G and the tax on gains.
- `src/model/boxes` has one file per box type: its fields, what it can be wired to, what it becomes in the engine and what it warns about. `model/shared.ts` builds what every box shares and no box owns: the path G follows and the tax on all pensions together.
- Every krone moves through `World.move`, so the ledger always adds up. Do not change a money balance any other way. `World.grow` is for value that appears without moving money and `World.fallShort` for what could not be paid. `World.tally` adds to a flow without anything happening.
- The simulation and the plan run in Web Workers. Nothing on screen calculates money.

## Components

- `src/components` has the general parts: fields, header, tabs with `TabPanel`, footer, language picker, theme lever, wire legend, period scale, tour, file buttons, error boundary, the two charts and the aurora. `canvas.ts`, `chartAxis.ts`, `flowsLayout.ts` and `formats.ts` are their shared helpers. They know nothing of box types. What does know them stays in `src/input` and `src/simulation`.
- Every component has a `*.stories.tsx` next to it, and its tests are in the stories' `play` functions. `npm test` runs them at laptop, tablet and phone size in the dark colours, and at laptop size in the light ones, and every story must also fit the screen at each size.
- What shows numbers takes them as props, so it can be tested without a Web Worker: `SimulationView` with `simulation/fixedPlayer.ts`, and `PlanView`.
- `simulation/sentences.ts` puts the simulation's figures into words, and `components/flowsLayout.ts` holds the geometry of `WithdrawalsChart`. Both are plain functions with unit tests, so they are tested without a browser.

## The model

Wires come in three kinds, and the shape of a dot on a card says which:

- **Money** moves kroner. Round dot, left and right.
- **Influence** changes a value without money coming from another box, such as a return. Diamond, from above.
- **Basis** only reads a number, such as salary for OTP. Square.

A wire is a choice. There is one G and one birth year, so those boxes have no wires. Housing and the wealth tax have no wires either, since they count every box of their kind.

The graph's invariants live in `settled` in `model/graph.ts`: the box for yourself is there, G is there exactly while a box reads it and a wire only joins boxes that can be joined. Every setup read from local storage or a file goes through it, and so does every change on the canvas. `src/input/flow.ts` is where React Flow's words (nodes, edges, handles) meet the model's (boxes, wires, wire kinds).

## Words

One word per concept. The code column is what to use in code and comments.

| Concept | Code | English UI | Norwegian UI |
|---|---|---|---|
| What the user builds | `Graph`. `SimulationInput` is what the simulation reads | setup | oppsett |
| A box, drawn as a card | `Box`, `BoxType`. React Flow calls it a node | box | boks |
| A wire, its kind and the dot it starts from | `Wire`, `WireKind`: `money`, `influence`, `basis`. React Flow calls a wire an edge and a dot a handle, whose id is the wire kind | connector; dot; Money, Influence, Basis | connector; prikk; Penger, Påvirkning, Grunnlag |
| What keeps a value from day to day | `Stock`: an account, OTP, a calculated balance or a withdrawal. Its value on a day is its balance (`World.balances`). `account` is one box type | Account; Balance | Konto; Beholdning |
| A balance that is not money | `Stock.unit` `'calculated'` | Calculated balance | Beregnet beholdning |
| A withdrawal, and the hidden stock it settles through | box type `withdrawal`. In the engine a gate: `settleGate`, `GateSources`, `Stock.hidden` | Withdrawal | Uttak |
| What a withdrawal must pay | `Need`, `needAt` | Need | Behov |
| What it received beyond the need | `SURPLUS`, `surplusTo`, `surplusAt` | Left over (chart), Surplus (plan) | Til overs (chart), Overskudd (plan) |
| What could not be paid | `ledger.short`, `World.fallShort`, `mayFallShort`, the plan's `unmet`. `heldShare` is the share of passes with nothing short | Missing; is short by | Mangler |
| A named stream of money | flow: `ledger.flows`, an amount per label and calendar year. A move's label is `Recorded.label` | | |
| Money moving, and value appearing | `World.move` and `World.grow`. Not the plan's `move` line, which is between accounts | | |
| One run through the period | `runPass`. Passes come in antithetic pairs with opposite shocks (`passNoise(pair, sign)`) | Pass | Pass |
| The middle and where most passes lie | `median`, and `spread` with `p10`, `p25`, `p75`, `p90` | median; band | medianen; båndet |
| A line in the plan | `PlanLine`, which `starts`, `changes` or `stops` (`PlanChange`) | Plan | Plan |
| G and its regulation each 1 May | box type and factor `g` (`G` in norway.ts), `regulateWithG` | G (base amount) | G (grunnbeløpet) |
| The gross salary a pension reads | `pensionBasis`, read over a basis wire | Pension basis (a year) | Pensjonsgrunnlag (i året) |
| Shielding | `ledger.shield`, `earnShield`. Stored as `shieldRate` and `unusedShield` | Shielding rate; shielding deduction | Skjermingsrente; skjermingsfradrag |
| Tax on gains | `Stock.taxOnGain`. Stored as `taxRate` on the account | Tax on gains | Skatt på gevinst |
| The old-age pension | box type `folketrygd`, kept as stored | National pension | Alderspensjon (NAV) |
| Today's money | every amount. Returns and G growth are real | today's money | dagens kroner |

Stored identifiers, such as box types and field names, are never renamed. A better word only ever replaces one that lives in memory.

## Adding a box type

1. Add a file under `src/model/boxes`, with its data type and a `BoxSpec`. `declare` gets a `DeclareContext` to add stocks, factors and rules. `build` gets a `BuildContext`, where every box has been declared and `stockOf` finds any of them. Read percent fields with `shareOf` from `model/values.ts`.
2. Let the spec say what other files would otherwise guess. A type that reads G sets `readsG: true`, and `usesG` if it needs the path G follows only sometimes. A type that holds value from a date sets `startsOn`, and the simulation starts on the first of those dates.
3. Add it to the union in `model/types.ts`, and to `catalog` in `model/catalog.ts` and to `ADDABLE_TYPES` there if the toolbar should add it. A box with a name gets a default name in `DefaultNames`.
4. Add a card in `input/BoxCards.tsx`, where `nodeTypes` must have one for every `BoxType`, and a story in `input/BoxCards.stories.tsx`. Add the texts in `i18n.ts` in both languages, including `boxTypes`, `addBox` and the default name.
5. If it holds names below the box, as a budget holds its lines, `model/names.ts` must rename them too. If it fills an account during the draw phase, `drawRank` in `model/query.ts` must count it.

Do not change `engine.ts` or `connections.ts` for this. If a new rule is needed, add it to `engine/rules.ts`, or to `engine/norway.ts` if it is Norwegian law. Name the flows it records under where the rule is made. The plan sorts a move by where it comes from and goes, and knows only the flow names it imports, so a new kind of tax or pension also needs a line in `flowOf` in `model/plan.ts`.

## Rules

- Stored data must keep working, in the browser and in files the user has saved. When the stored shape changes, raise `VERSION` in `model/storage.ts` from N to N+1. Add one `fromVersionN` in `model/migrations.ts` and one line for it in `STEPS`, and add `version-<N+1>.json` as an example in `model/__saved__`. A file can skip many versions, so a step is never deleted. A migration keeps frozen copies of what it needs and imports no code that keeps changing, so an old file always comes out the same. Stored pension figures must not change meaning.
- `model/__golden__` holds numbers recorded from the first engine. If those tests fail, an old result has changed. Do not update the file to make them pass without saying so.
- **The repository is public.** No real salaries, balances or birth years in code, tests or commit messages. Use made-up numbers.
- All amounts are in today's money, and returns are real, above inflation.
- Write code and comments in English. The app has Norwegian and English texts, and both must be kept up to date.

## Linear

- An issue that has been carried out goes to In Review, however the work was started. Leave Done to the user.
- A Backlog issue that needs follow-up gets the label `Trenger mer oppfølging`.
- In a loop, `linear-task` runs in a subagent, so a long loop does not fill the main session.
