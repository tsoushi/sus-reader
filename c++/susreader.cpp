#include "susreader.hpp"

#include <sstream>
#include <regex>
#include <algorithm>

using std::cout;
using std::endl;
using std::ifstream;
using std::string;
using std::vector;
using std::map;
using std::stoi;
using std::stod;

namespace SusReader {

    Note::Note(NoteType noteType) : type(noteType) {}
    Tap::Tap() : Note(NoteType::Tap) {}
    double Tap::getFirstTime() const {
        return posBeat;
    }
    Slide1::Slide1() : Note(NoteType::Slide1) {}
    double Slide1::getFirstTime() const {
        return startPosBeat;
    }
    SongData::SongData(SongInfo info, vector<Note*> notes, vector<BPMChange> bpmChanges, vector<BeatPerMeasureChange> beatPerMeasureChanges)
        : info(info), notes(notes), bpmChanges(bpmChanges), beatPerMeasureChanges(beatPerMeasureChanges)
    {}
    SongData::~SongData() {
        for (auto& note : notes) {
            delete note;
        }
    }


    bool startsWith(const string& str, const string& prefix) {
        return str.size() >= prefix.size() && str.compare(0, prefix.size(), prefix) == 0;
    }

    bool isBase36(const string& str) {
        for (char const& c : str) {
            if (!(('0' <= c && c <= '9') || ('a' <= c && c <= 'z') || ('A' <= c && 'Z'))) return false;
        }
        return true;
    }

    vector<string> split(const string& str, char delim) {
        vector<string> texts;

        std::stringstream ss{ str };

        string buf;
        while (getline(ss, buf, delim)) {
            texts.push_back(buf);
        }

        return texts;
    }



    int b36(const string& str) {
        return stoi(str, nullptr, 36);
    }

    double measureToBeat(vector<BeatPerMeasureChange>& beatPerMeasureChanges, double measure) {
        if (measure < beatPerMeasureChanges[0].posMeasure) {
            return measure * beatPerMeasureChanges[0].beatPerMeasure;
        }
        int i;
        for (i = 0; i < beatPerMeasureChanges.size() - 1; i++) {
            if (beatPerMeasureChanges[i].posMeasure == measure) return beatPerMeasureChanges[i].posBeat;
            if (beatPerMeasureChanges[i].posMeasure < measure && measure < beatPerMeasureChanges[i + 1].posMeasure) {
                return beatPerMeasureChanges[i].posBeat + (measure - beatPerMeasureChanges[i].posMeasure) * beatPerMeasureChanges[i].beatPerMeasure;
            }
        }
        return beatPerMeasureChanges[i].posBeat + (measure - beatPerMeasureChanges[i].posMeasure) * beatPerMeasureChanges[i].beatPerMeasure;
    }

    struct PosBeatData {
        double posBeat;
        string data;
    };
    vector<PosBeatData> scanPosBeatData(vector<BeatPerMeasureChange>& beatPerMeasureChanges, const string& line) {
        double measure = stoi(line.substr(1, 3));
        const string right = split(line, ':')[1];
        const int size = (int)right.length() / 2;

        vector<PosBeatData> objects;
        for (int i = 0; i < size; i++) {
            const string data = right.substr(i * 2, 2);
            if (data == "00") continue;
            objects.push_back({
                measureToBeat(beatPerMeasureChanges, measure + (double)i / size),
                data
                });
        }
        return objects;
    }

    double beatToSec(vector<BPMChange>& bpmChanges, double beat, double offsetSec) {
        if (beat < bpmChanges[0].posBeat) {
            return -offsetSec + (beat / bpmChanges[0].bpm) * 60;
        }
        int i;
        for (i = 0; i < bpmChanges.size() - 1; i++) {
            if (bpmChanges[i].posBeat == beat) return bpmChanges[i].posSec;
            if (bpmChanges[i].posBeat < beat && beat < bpmChanges[i + 1].posBeat) {
                return bpmChanges[i].posSec + ((beat - bpmChanges[i].posBeat) / bpmChanges[i].bpm) * 60;
            }
        }
        
        return bpmChanges[i].posSec + ((beat - bpmChanges[i].posBeat) / bpmChanges[i].bpm) * 60;
    }

    SongData* readSus(string filePath) {
        ifstream ifs(filePath);

        vector<Note*> notes;
        vector<BeatPerMeasureChange> beatPerMeasures;
        map<int, Slide1*> channelMap;
        map<int, BPMChange> bpmChangeMap;
        SongInfo songInfo;

        // 小節情報前読み込み
        string line;
        while (getline(ifs, line)) {
            if (std::regex_match(line, std::regex(R"(#[0-9]+02:[0-9]+)"))) {
                BeatPerMeasureChange o{};
                o.beatPerMeasure = stod(split(line, ':')[1]);
                o.posBeat = stoi(split(line, ':')[0].substr(1, 3));
                beatPerMeasures.push_back(o);
            }
        }

        {
            double currentMeasure = 0;
            double currentBeat = 0;
            double currentBeatPerMeasure = beatPerMeasures[0].beatPerMeasure;
            for (auto& beatPerMeasure : beatPerMeasures) {
                beatPerMeasure.posBeat = (beatPerMeasure.posMeasure - currentMeasure) * currentBeatPerMeasure + currentBeat;
                currentMeasure = beatPerMeasure.posMeasure;
                currentBeat = beatPerMeasure.posBeat;
                currentBeatPerMeasure = beatPerMeasure.beatPerMeasure;
            }
        }

        ifs.clear();
        ifs.seekg(0);

        while (getline(ifs, line)) {
            // ex) #BPM01:120
            if (startsWith(line, "#BPM")) {
                const int bpmIndex = b36(split(line, ':')[0].substr(4, 2));
                const double bpm = stod(split(line, ':')[1]);

                BPMChange bpmChange;
                bpmChange.bpm = bpm;
                bpmChangeMap[bpmIndex] = bpmChange;
                continue;
            }

            // ex) #WAVEOFFSET 10
            if (startsWith(line, "#WAVEOFFSET")) {
                songInfo.waveOffsetSec = stod(split(line, ' ')[1]);
                continue;
            }

            if (line[0] == '#' && std::regex_match(line, std::regex(R"(#[0-9A-Za-z]+:[0-9a-zA-Z]+$)"))) {
                // 小節情報がある場合
                /* objType
                0: その他
                1: tap
                2: hold
                3: slide1
                4: slide2
                5: flick
                */
                const char objType = line[4];

                const auto objects = scanPosBeatData(beatPerMeasures, line);

                if (objType == '0' && line[5] == '8') {
                    // BPM変更
                    for (const auto& obj : objects) {
                        const int bpmIndex = b36(obj.data);
                        bpmChangeMap[bpmIndex].posBeat = obj.posBeat;
                    }
                }
                else if (objType == '1') {
                    // Tap
                    for (const auto& obj : objects) {
                        auto tap = new Tap{};
                        tap->leftLane = b36(line.substr(5, 1));
                        tap->laneWidth = b36(obj.data.substr(1, 1));
                        tap->posBeat = obj.posBeat;
                        notes.push_back(tap);
                    }
                }
                else if (objType == '3') {
                    // slide1
                    const int channel = b36(line.substr(6, 1));
                    map<int, Slide1*> localChannelMap;

                    for (const auto& obj : objects) {
                        if (obj.data[0] == '1') {
                            // ロングノーツ開始
                            auto slide = new Slide1{};
                            slide->startLeftLane = b36(line.substr(5, 1));
                            slide->startLaneWidth = b36(obj.data.substr(1, 1));
                            slide->startPosBeat = obj.posBeat;
                            localChannelMap[channel] = slide;
                        }
                        else if (obj.data[0] == '2') {
                            // ロングノーツ終了
                            if (localChannelMap.count(channel) == 0) {
                                channelMap[channel]->endLeftLane = b36(line.substr(5, 1));
                                channelMap[channel]->endLaneWidth = b36(obj.data.substr(1, 1));
                                channelMap[channel]->endPosBeat = obj.posBeat;

                                notes.push_back(channelMap[channel]);
                                channelMap.erase(channel);
                            }
                            else {
                                localChannelMap[channel]->endLeftLane = b36(line.substr(5, 1));
                                localChannelMap[channel]->endLaneWidth = b36(obj.data.substr(1, 1));
                                localChannelMap[channel]->endPosBeat = obj.posBeat;

                                notes.push_back(localChannelMap[channel]);
                                localChannelMap.erase(channel);
                            }
                        }
                    }

                    for (auto it = localChannelMap.begin(); it != localChannelMap.end(); it++) {
                        channelMap[it->first] = it->second;
                    }
                }
            }
        }

        vector<BPMChange> bpmChanges;
        for (auto it = bpmChangeMap.begin(); it != bpmChangeMap.end(); it++) {
            bpmChanges.push_back(it->second);
        }
        std::sort(bpmChanges.begin(), bpmChanges.end(), [](BPMChange a, BPMChange b) {
            return a.posBeat < b.posBeat;
            });

        {
            double currentBeat = 0;
            double currentBPM = bpmChanges[0].bpm;
            double currentSec = -(songInfo.waveOffsetSec);

            for (auto& bpmChange : bpmChanges) {
                bpmChange.posSec = ((bpmChange.posBeat - currentBeat) / currentBPM) * 60 + currentSec;
                currentSec = bpmChange.posSec;
                currentBeat = bpmChange.posBeat;
                currentBPM = bpmChange.bpm;
            }
        }

        for (auto& note : notes) {
            if (note->type == NoteType::Tap) {
                auto tap = dynamic_cast<Tap*>(note);
                tap->posSec = beatToSec(bpmChanges, tap->posBeat, songInfo.waveOffsetSec);
            }
            else if (note->type == NoteType::Slide1) {
                auto slide = dynamic_cast<Slide1*>(note);
                slide->startPosSec = beatToSec(bpmChanges, slide->startPosBeat, songInfo.waveOffsetSec);
                slide->endPosSec = beatToSec(bpmChanges, slide->endPosBeat, songInfo.waveOffsetSec);
            }
        }

        for (auto& beatPerMeasure : beatPerMeasures) {
            beatPerMeasure.posSec = beatToSec(bpmChanges, beatPerMeasure.posBeat, songInfo.waveOffsetSec);
        }

        std::sort(notes.begin(), notes.end(), [](Note* a, Note* b) {
            return a->getFirstTime() < b->getFirstTime();
            });

        return new SongData{ songInfo, notes, bpmChanges, beatPerMeasures };
    }
}

using namespace SusReader;

int main() {
    auto data = readSus("t.sus");
    for (auto& note : data->notes) {
        if (note->type == NoteType::Tap) {
            auto tap = dynamic_cast<Tap*>(note);
            cout << tap->posSec << endl;
        }
        else if (note->type == NoteType::Slide1) {
            auto slide = dynamic_cast<Slide1*>(note);
            cout << slide->startPosSec << " : " << slide->endPosSec << endl;
        }
    }
    delete data;
    return 0;
}
