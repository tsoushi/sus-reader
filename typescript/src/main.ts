import { readSusFromFile } from './lib'

const songData = readSusFromFile('t.sus')

console.log(songData.info)
console.log(songData.beatPerMeasureChanges)
console.log(songData.bpmChanges)
console.log(songData.notes)
