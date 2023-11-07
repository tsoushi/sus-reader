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

export const scanPosBeatData = (beatPerMeasureChanges: Omit<BeatPerMeasureChange, 'posSec'>[], line: string) => {
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

export const beatToSec = (bpmChanges: BPMChange[], beat: number, offsetSec: number) => {
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
