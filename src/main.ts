import fs from 'fs'

import { Slide1, TapNote, BPMChange, scanPosBeatData, BeatPerMeasureChange, SongInfo, beatToSec, SongData, Note } from './lib'

const lines = fs.readFileSync('song1.sus', 'utf-8').split('\n')

const notes: Partial<Note>[] = []
const beatPerMeasures: Partial<BeatPerMeasureChange>[] = []
const channelMap: { [index: number]: Partial<Slide1> } = {}
const bpmChangeMap: { [index: number]: Partial<BPMChange> } = {}
const songInfo: SongInfo = {}

for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]

    if (line.startsWith('#BPM')) {
        const bpmIndex = parseInt(line.split(':')[0].substring(4, 6), 36)
        const bpm = parseFloat(line.split(':')[1])

        bpmChangeMap[bpmIndex] = {
            bpm,
        }
        continue
    }

    if (line.startsWith('#WAVEOFFSET')) {
        songInfo.waveOffsetSec = parseFloat(line.split(' ')[1])
        continue
    }

    if (line.match(/^#[0-9A-Za-z]+:[0-9a-zA-Z]+$/)) {
        // 小節情報がある場合
        const objType = (() => {
            switch (line[4]) {
                case '0':
                    if (line[5] === '2') return 'beatPerMeasureChange'
                    else if (line[5] === '8') return 'bpmChange'
                    else return null
                case '1':
                    return 'tap'
                case '2':
                    return 'hold'
                case '3':
                    return 'slide1'
                case '4':
                    return 'slide2'
                case '5':
                    return 'flick'
                default:
                    return null
            }
        })()

        if (objType === 'beatPerMeasureChange') {
            beatPerMeasures.push({
                beatPerMeasure: parseFloat(line.split(':')[1]),
                posBeat: parseInt(line.split(':')[0].substring(1, 4), 10),
            })
            continue
        }

        const objects = scanPosBeatData(line)

        if (objType === 'bpmChange') {
            for (const obj of objects) {
                const bpmIndex = parseInt(obj.data, 36)
                bpmChangeMap[bpmIndex].posBeat = obj.posBeat
            }
        } else if (objType === 'tap') {
            for (const obj of objects) {
                notes.push({
                    type: 'tap',
                    leftLane: parseInt(line[5], 36),
                    width: parseInt(obj.data[1]),
                    posBeat: obj.posBeat,
                })
            }
        } else if (objType === 'slide1') {
            const channel = parseInt(line[6], 36)
            const localChannelMap: { [index: number]: Partial<Slide1> } = {}

            for (const obj of objects) {
                if (obj.data[0] === '1') {
                    localChannelMap[channel] = {
                        type: 'slide1',
                        startLeftLane: parseInt(line[5], 36),
                        startWidth: parseInt(obj.data[1]),
                        startPosBeat: obj.posBeat,
                    }
                } else if (obj.data[0] === '2') {
                    if (localChannelMap[channel] === undefined) {
                        channelMap[channel].endLeftLane = parseInt(line[5], 36)
                        channelMap[channel].endWidth = parseInt(obj.data[1])
                        channelMap[channel].endPosBeat = obj.posBeat

                        notes.push(channelMap[channel])
                        delete channelMap[channel]
                    } else {
                        localChannelMap[channel].endLeftLane = parseInt(line[5], 36)
                        localChannelMap[channel].endWidth = parseInt(obj.data[1])
                        localChannelMap[channel].endPosBeat = obj.posBeat

                        notes.push(localChannelMap[channel])
                        delete localChannelMap[channel]
                    }
                }
            }
            Object.keys(localChannelMap).map((key) => {
                channelMap[parseInt(key)] = localChannelMap[parseInt(key)]
            })
        }
    }
}

const bpmChangesBuf = Object.keys(bpmChangeMap).map((key) => bpmChangeMap[parseInt(key)]) as (Omit<BPMChange, 'posSec'> & Partial<Pick<BPMChange, 'posSec'>>)[]

bpmChangesBuf.sort((a, b) => a.posBeat - b.posBeat)

{
    let currentBeat = 0
    let currentBPM = bpmChangesBuf[0].bpm
    let currentSec = -(songInfo.waveOffsetSec ?? 0)

    for (const bpmChange of bpmChangesBuf) {
        bpmChange.posSec = ((bpmChange.posBeat - currentBeat) / currentBPM) * 60 + currentSec
        currentSec = bpmChange.posSec
        currentBeat = bpmChange.posBeat
        currentBPM = bpmChange.bpm
    }
}
const bpmChanges = bpmChangesBuf as BPMChange[]

notes.map((note) => {
    if (note.type === 'tap') {
        note.posSec = beatToSec(bpmChanges, note.posBeat as number, songInfo.waveOffsetSec ?? 0)
    } else if (note.type === 'slide1') {
        note.startPosSec = beatToSec(bpmChanges, note.startPosBeat as number, songInfo.waveOffsetSec ?? 0)
        note.endPosSec = beatToSec(bpmChanges, note.endPosBeat as number, songInfo.waveOffsetSec ?? 0)
    }
})

beatPerMeasures.map((beatPerMeasure) => {
    beatPerMeasure.posSec = beatToSec(bpmChanges, beatPerMeasure.posBeat as number, songInfo.waveOffsetSec ?? 0)
})

const songData: SongData = {
    info: songInfo,
    notes: notes as Note[],
    bpmChanges: bpmChanges,
    beatPerMeasureChanges: beatPerMeasures as BeatPerMeasureChange[],
}

songData.notes.sort((a, b) => {
    const getStartSec = (note: Note) => {
        if (note.type === 'tap') {
            return note.posSec
        } else if (note.type === 'slide1') {
            return note.startPosSec
        }
        throw new Error('Invalid note type')
    }
    return getStartSec(a) - getStartSec(b)
})

console.log(beatPerMeasures)
console.log(bpmChanges)
console.log(notes)
