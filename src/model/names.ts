// What a box is called, when the language changes. It only touches names, so no result can change.
import type { Graph, PlacedBox } from './types';

const comparable = (name: string) => name.trim().toLocaleLowerCase();

// A name changes only when all of it is in the list, so anything longer that someone has written stays as it is.
export function renameBoxes(graph: Graph, words: readonly (readonly [from: string, to: string])[]): Graph {
  const lookup = new Map(words.map(([from, to]) => [comparable(from), to]));
  const renamed = (name: string) => lookup.get(comparable(name)) ?? name;

  const boxes = graph.boxes.map((box): PlacedBox => {
    if (box.type === 'budget') {
      const lines = box.data.lines.map((line) => ({ ...line, name: renamed(line.name) }));
      const same = renamed(box.data.name) === box.data.name && lines.every((line, index) => line.name === box.data.lines[index].name);
      return same ? box : { ...box, data: { ...box.data, name: renamed(box.data.name), lines } };
    }
    if (!('name' in box.data) || renamed(box.data.name) === box.data.name) return box;
    return { ...box, data: { ...box.data, name: renamed(box.data.name) } } as PlacedBox;
  });
  // The same graph if nothing changed, so a simulation that has nothing new to show keeps running.
  return boxes.every((box, index) => box === graph.boxes[index]) ? graph : { ...graph, boxes };
}
