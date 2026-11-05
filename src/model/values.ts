// How a value typed on a card is read, the same way in every box.

// A percent typed on a card, as a share. The floor keeps an odd value from breaking the formulas.
export const shareOf = (percent: number, floor = 0) => Math.max(floor, percent) / 100;
