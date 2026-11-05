// Age is the year minus the birth year, whatever the month. A fraction is months, so an age can be given to the month.

// When an age begins, in milliseconds. 67.5 begins on the first of July.
export function startOfAge(birthYear: number, age: number): number {
  const year = birthYear + age;
  return Date.UTC(Math.floor(year), Math.round((year - Math.floor(year)) * 12), 1);
}

// The age on a date. It goes up on the first of January, like every age here.
export const ageOn = (date: Date, birthYear: number) => date.getUTCFullYear() - birthYear;
