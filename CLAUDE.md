# Curve

A simulator for saving and withdrawing, in the browser. Everything stays in local storage.

```
npm run dev     # start the app
npm test        # all tests, must stay green
npm run build   # type check and build
```

## Architecture

Three layers. Dependencies only go downwards, and `src/architecture.test.ts` enforces it.

```
src/input, src/simulation, src/components   What is on screen. React, React Flow and canvas.
src/model                                   The drawing as data. Boxes, wires, storage. No React.
src/engine                                  The simulation. Stocks, factors, rules. No boxes, no browser.
```

- `src/engine` knows nothing of box types. It runs rules on stocks, day by day. All Norwegian pension law lives in `engine/norway.ts`.
- `src/model/boxes` has one file per box type: its fields, what it can be wired to, what it becomes in the engine and what it warns about.
- Every krone moves through `World.move`, so the ledger always adds up. Do not change a money balance any other way. `World.grow` is for value that appears without moving money.
- The simulation runs in a Web Worker. Nothing on screen calculates money.

## The model

Wires come in three kinds, and the shape of a dot on a card says which:

- **Money** moves kroner. Round dot, left and right.
- **Influence** changes a value without money coming from another box, such as a return. Diamond, from above.
- **Basis** only reads a number, such as salary for OTP. Square.

A wire is a choice. There is one G and one birth year, so those boxes have no wires.

## Adding a box type

1. Add a file under `src/model/boxes`, with its data type and a `BoxSpec`.
2. Add it to the union in `model/types.ts` and to `model/catalog.ts`.
3. Add a card in `input/BoxCards.tsx`, and the texts in `i18n.ts`.

Do not change `engine.ts` or `connections.ts` for this. If a new rule is needed, add it to `engine/rules.ts`.

## Rules

- Stored data must keep working. When the stored shape changes, raise the version in `model/storage.ts` and add a migration in `model/migrations.ts`. Stored pension figures must not change meaning.
- `model/__golden__` holds numbers recorded from the first engine. If those tests fail, an old result has changed. Do not update the file to make them pass without saying so.
- **The repository is public.** No real salaries, balances or birth years in code, tests or commit messages. Use made-up numbers.
- All amounts are in today's money, and returns are real, above inflation.
- Write code and comments in English. The app has Norwegian and English texts, and both must be kept up to date.
