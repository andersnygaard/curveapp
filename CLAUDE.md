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

## Components

- `src/components` has the general parts: fields, header, tabs, footer, language picker, wire legend and chart. They know nothing of box types. What does know them stays in `src/input` and `src/simulation`.
- Every component has a `*.stories.tsx` next to it, and its tests are in the stories' `play` functions. `npm test` runs them at laptop, tablet and phone size in the dark colours, and at laptop size in the light ones, and every story must also fit the screen at each size.
- What shows numbers takes them as props, so it can be tested without a Web Worker: `SimulationView` with `simulation/fixedPlayer.ts`, and `PlanView`.

## The model

Wires come in three kinds, and the shape of a dot on a card says which:

- **Money** moves kroner. Round dot, left and right.
- **Influence** changes a value without money coming from another box, such as a return. Diamond, from above.
- **Basis** only reads a number, such as salary for OTP. Square.

A wire is a choice. There is one G and one birth year, so those boxes have no wires.

## Adding a box type

1. Add a file under `src/model/boxes`, with its data type and a `BoxSpec`.
2. Add it to the union in `model/types.ts` and to `model/catalog.ts`.
3. Add a card in `input/BoxCards.tsx`, a story in `input/BoxCards.stories.tsx`, and the texts in `i18n.ts`.

Do not change `engine.ts` or `connections.ts` for this. If a new rule is needed, add it to `engine/rules.ts`.

## Rules

- Stored data must keep working, in the browser and in files the user has saved. When the stored shape changes, raise the version in `model/storage.ts`, add a migration in `model/migrations.ts` and add an example in `model/__saved__`. A file can skip many versions, so migrations are never deleted. Stored pension figures must not change meaning.
- `model/__golden__` holds numbers recorded from the first engine. If those tests fail, an old result has changed. Do not update the file to make them pass without saying so.
- **The repository is public.** No real salaries, balances or birth years in code, tests or commit messages. Use made-up numbers.
- All amounts are in today's money, and returns are real, above inflation.
- Write code and comments in English. The app has Norwegian and English texts, and both must be kept up to date.

## Linear

- An issue that has been carried out goes to In Review, however the work was started. Leave Done to the user.
- A Backlog issue that needs follow-up gets the label `Trenger mer oppfølging`.
- In a loop, `linear-task` runs in a subagent, so a long loop does not fill the main session.
