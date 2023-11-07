#pragma once

#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <map>

namespace SusReader {
    using std::string;
    using std::vector;

    struct SongInfo {
        string title = "";
        string artist = "";
        string designer = "";
        double waveOffsetSec = 0;
    };

    enum class NoteType {
        Tap,
        Slide1
    };

    struct Note {
        Note(NoteType noteType);
        virtual ~Note() {};
        virtual double getFirstTime() const = 0;

        NoteType type;
    };

    struct Tap : Note {
        Tap();
        double getFirstTime() const override;

        int leftLane = 0;
        int laneWidth = 0;
        double posSec = 0;
        double posBeat = 0;
    };

    struct Slide1 : Note {
        Slide1();
        double getFirstTime() const override;

        int startLeftLane = 0;
        int startLaneWidth = 0;
        double startPosSec = 0;
        double startPosBeat = 0;
        int endLeftLane = 0;
        int endLaneWidth = 0;
        double endPosSec = 0;
        double endPosBeat = 0;
    };

    struct BPMChange {
        double bpm;
        double posSec;
        double posBeat;
    };

    struct BeatPerMeasureChange {
        double beatPerMeasure;
        double posSec;
        double posBeat;
        double posMeasure;
    };

    class SongData {
    public:
        SongData(SongInfo info, vector<Note*> notes, vector<BPMChange> bpmChanges, vector<BeatPerMeasureChange> beatPerMeasureChanges);
        ~SongData();

        SongInfo info;
        vector<Note*> notes;
        vector<BPMChange> bpmChanges;
        vector<BeatPerMeasureChange> beatPerMeasureChanges;
    };

    SongData* readSus(string filePath);
}