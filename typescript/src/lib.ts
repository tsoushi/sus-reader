import fs from 'fs'

export interface SongData {
    info: SongInfo
    notes: (Slide1 | TapNote)[]
    bpmChanges: BPMChange[]
    beatPerMeasureChanges: BeatPerMeasureChange[]
}

export interface SongInfo {
    title?: string
    artist?: string
    designer?: string
    waveOffsetSec?: number
}

export type Note = Slide1 | TapNote

export interface Slide1 {
    type: 'slide1'
    startLeftLane: number
    startWidth: number
    startPosSec: number
    startPosBeat: number
    endLeftLane: number
    endWidth: number
    endPosSec: number
    endPosBeat: number
}

export interface TapNote {
    type: 'tap'
    leftLane: number
    width: number
    posSec: number
    posBeat: number
}

export interface BPMChange {
    bpm: number
    posSec: number
    posBeat: number
}

export interface BeatPerMeasureChange {
    beatPerMeasure: number
    posSec: number
    posBeat: number
    posMeasure: number
}

const scanPosBeatData = (beatPerMeasureChanges: Omit<BeatPerMeasureChange, 'posSec'>[], line: string) => {
    const measure = parseInt(line.substring(1, 4))
    const right = line.split(':')[1]
    const size = right.length / 2

    const objects: { posBeat: number; data: string }[] = []
    for (let i = 0; i < size; i++) {
        const data = right.substring(i * 2, i * 2 + 2)
        if (data === '00') continue
        objects.push({
            posBeat: measureToBeat(beatPerMeasureChanges, measure + i / size),
            data,
        })
    }
    return objects
}

// 曲開始時からの小節数を拍数に変換
const measureToBeat = (beatPerMeasureChanges: Omit<BeatPerMeasureChange, 'posSec'>[], measure: number) => {
    if (measure < beatPerMeasureChanges[0].posMeasure) {
        return measure * beatPerMeasureChanges[0].beatPerMeasure
    }
    for (let i = 0; i < beatPerMeasureChanges.length; i++) {
        if (beatPerMeasureChanges[i].posMeasure === measure) return beatPerMeasureChanges[i].posBeat
        if (beatPerMeasureChanges[i].posMeasure < measure && (i === beatPerMeasureChanges.length - 1 || measure < beatPerMeasureChanges[i + 1].posMeasure)) {
            return beatPerMeasureChanges[i].posBeat + (measure - beatPerMeasureChanges[i].posMeasure) * beatPerMeasureChanges[i].beatPerMeasure
        }
    }
    throw new Error('measureToBeat: unreachable')
}

// 曲開始時からの拍数を秒数に変換
const beatToSec = (bpmChanges: BPMChange[], beat: number, offsetSec: number) => {
    if (beat < bpmChanges[0].posBeat) {
        return -offsetSec + (beat / bpmChanges[0].bpm) * 60
    }
    for (let i = 0; i < bpmChanges.length; i++) {
        if (bpmChanges[i].posBeat === beat) return bpmChanges[i].posSec
        if (bpmChanges[i].posBeat < beat && (i === bpmChanges.length - 1 || beat < bpmChanges[i + 1].posBeat)) {
            return bpmChanges[i].posSec + ((beat - bpmChanges[i].posBeat) / bpmChanges[i].bpm) * 60
        }
    }
    throw new Error('beatToSec: unreachable')
}

export const readSusFromFile = (filePath: string): SongData => {
    return readSus(fs.readFileSync(filePath, 'utf-8'))
}

export const readSus = (text: string): SongData => {
    const lines = text.split('\n')

    const notes: Partial<Note>[] = []
    const preBeatPerMeasures: Partial<BeatPerMeasureChange>[] = []
    const channelMap: { [index: number]: Partial<Slide1> } = {}
    const bpmChangeMap: { [index: number]: Partial<BPMChange> } = {}
    const songInfo: SongInfo = {}

    // 小節情報前読み込み
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx]

        if (line.match(/^#[0-9]+02:[0-9]+$/)) {
            preBeatPerMeasures.push({
                beatPerMeasure: parseFloat(line.split(':')[1]),
                posMeasure: parseInt(line.split(':')[0].substring(1, 4), 10),
            })
            continue
        }
    }

    // 拍数変更情報のposBeatを計算
    {
        let currentMeasure = 0
        let currentBeat = 0
        if (preBeatPerMeasures[0].beatPerMeasure === undefined) throw new Error('unexpected error')
        let currentBeatPerMeasure = preBeatPerMeasures[0].beatPerMeasure

        for (const beatPerMeasure of preBeatPerMeasures) {
            if (beatPerMeasure.posMeasure === undefined) throw new Error('unexpected error')
            if (beatPerMeasure.beatPerMeasure === undefined) throw new Error('unexpected error')
            beatPerMeasure.posBeat = (beatPerMeasure.posMeasure - currentMeasure) * currentBeatPerMeasure + currentBeat
            currentMeasure = beatPerMeasure.posMeasure
            currentBeat = beatPerMeasure.posBeat
            currentBeatPerMeasure = beatPerMeasure.beatPerMeasure
        }
    }
    const beatPerMeasures = preBeatPerMeasures as (Omit<BeatPerMeasureChange, 'posSec'> & Partial<Pick<BeatPerMeasureChange, 'posSec'>>)[]

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

        if (line.match(/^#[0-9]+:[0-9a-zA-Z]+$/)) {
            // 小節情報がある場合
            const objType = (() => {
                switch (line[4]) {
                    case '0':
                        if (line[5] === '8') return 'bpmChange'
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

            const objects = scanPosBeatData(beatPerMeasures, line)

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
        beatPerMeasure.posSec = beatToSec(bpmChanges, beatPerMeasure.posBeat, songInfo.waveOffsetSec ?? 0)
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

    return songData
}
