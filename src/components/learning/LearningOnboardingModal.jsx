import { useState } from 'react';
import Modal from '../Modal';
import {
  Compass, Code, Music, Video, Palette, Languages, ArrowRight,
  CheckCircle2, Sparkles, Target, Layers, Play, Sliders, CheckSquare,
  Globe, FileText, Info
} from 'lucide-react';

const EXAMPLE_JOURNEYS = [
  {
    domain: 'Programming / DSA',
    icon: Code,
    color: 'from-[#3d7a75] to-[#2f5378]',
    title: 'Master Data Structures & Algorithms in Java',
    goal: 'Solve 100 Medium problems & crack technical interviews',
    structure: 'Phase-based Roadmap',
    phases: [
      {
        name: 'Phase 1: Foundation',
        topics: [
          { name: 'Arrays & ArrayLists', completion: 100, mastery: 85, status: 'Completed', tasks: ['Learn traversal', 'Practice insertion & deletion', 'Solve 3 LC Mediums'] },
          { name: 'Strings & HashMaps', completion: 60, mastery: 50, status: 'In Progress', tasks: ['Understand hashing concept', 'Solve Two Sum & Valid Anagram'] }
        ]
      },
      {
        name: 'Phase 2: Core Data Structures',
        topics: [
          { name: 'Linked Lists & Stacks', completion: 0, mastery: 0, status: 'Not Started', tasks: ['Implement singly & doubly linked lists', 'Solve Valid Parentheses'] }
        ]
      }
    ]
  },
  {
    domain: 'Video Editing',
    icon: Video,
    color: 'from-purple-500 to-pink-600',
    title: 'Become a Professional Video Editor',
    goal: 'Master cinematic cuts, audio mixing, and color grading',
    structure: 'Simple Structure',
    phases: [
      {
        name: 'Learning Roadmap',
        topics: [
          { name: 'Timeline Cut & Assembly', completion: 100, mastery: 90, status: 'Completed', tasks: ['Master J-cuts & L-cuts', 'Sync multi-camera audio'] },
          { name: 'Color Correction & LUTs', completion: 40, mastery: 35, status: 'In Progress', tasks: ['Understand Vectorscope & Parade', 'Apply primary color balance'] }
        ]
      }
    ]
  },
  {
    domain: 'Music / Guitar',
    icon: Music,
    color: 'from-amber-500 to-orange-600',
    title: 'Learn Acoustic Guitar Basics',
    goal: 'Play 10 favorite songs with smooth chord switching',
    structure: 'Simple Structure',
    phases: [
      {
        name: 'Chord & Rhythm Roadmap',
        topics: [
          { name: 'Open Chords (C, G, D, Em)', completion: 80, mastery: 75, status: 'In Progress', tasks: ['Practice C to G transition', 'Strum 4/4 rhythm pattern'] }
        ]
      }
    ]
  }
];

export default function LearningOnboardingModal({ isOpen, onClose, onStartCreate }) {
  const [step, setStep] = useState(1);
  const [selectedExampleIndex, setSelectedExampleIndex] = useState(0);

  if (!isOpen) return null;

  const markSeen = () => {
    try {
      localStorage.setItem('has_seen_learning_onboarding', 'true');
    } catch (e) {
      console.error('Failed to save onboarding state:', e);
    }
  };

  const handleClose = () => {
    markSeen();
    onClose();
  };

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      markSeen();
      onClose();
      if (onStartCreate) onStartCreate();
    }
  };

  const selectedExample = EXAMPLE_JOURNEYS[selectedExampleIndex];

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="How Learning Hub Works" maxWidth="max-w-2xl">
      <div className="py-1">
        {/* Step Navigation Pills */}
        <div className="flex items-center justify-between mb-6 px-2 border-b border-gray-100 dark:border-gray-800 pb-3">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map(s => (
              <button
                key={s}
                onClick={() => setStep(s)}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all ${
                  s === step
                    ? 'bg-[#3d7a75] text-white dark:bg-[#5fae9e] dark:text-[#0e2320] shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-[#eef2f4] dark:hover:bg-[#222b33]'
                }`}
              >
                <span>Step {s}</span>
                {s === 1 && <span className="hidden sm:inline">• Vision</span>}
                {s === 2 && <span className="hidden sm:inline">• Domains</span>}
                {s === 3 && <span className="hidden sm:inline">• Interactive Example</span>}
              </button>
            ))}
          </div>
          <span className="text-[11px] font-bold text-gray-400">Step {step} of 3</span>
        </div>

        {/* SCREEN 1: VISION & PHILOSOPHY */}
        {step === 1 && (
          <div className="space-y-5 animate-fadeIn">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-tr from-[#3d7a75] to-[#2d3f56] rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-[#3d7a75]/20 text-white">
                <Compass size={32} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                Your Learning. Your Way.
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-300 max-w-md mx-auto leading-relaxed">
                Learning Hub is your personal space to turn any goal into clear topics, actionable steps, and consistent daily progress.
              </p>
            </div>

            {/* Core Philosophy Banner */}
            <div className="p-4 bg-gradient-to-r from-[#e4ecf5]/60 to-[#eae7f5]/60 dark:from-[#182a40]/60 dark:to-[#232042]/60 border border-[#e2e8ec] dark:border-[#2a343d] rounded-2xl">
              <div className="flex items-center gap-2 text-xs font-bold text-[#2f5378] dark:text-[#8fb4d9] mb-1">
                <Sparkles size={14} className="text-[#c99a52]" /> Core Principle
              </div>
              <p className="text-xs text-[#182a40] dark:text-[#f1f5f9] font-semibold italic">
                "You create the path. We help you complete it."
              </p>
              <p className="text-[11px] text-[#2f5378] dark:text-[#8fb4d9] mt-1">
                You own your roadmap, topics, tasks, and pace. The platform provides structure, progress tracking, and daily focus.
              </p>
            </div>

            {/* Visual Process Flow Cards */}
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl space-y-1">
                <div className="w-7 h-7 rounded-lg bg-[#e4ecf5] dark:bg-[#182a40] text-[#2f5378] dark:text-[#8fb4d9] mx-auto flex items-center justify-center">
                  <Target size={15} />
                </div>
                <div className="font-bold text-[11px]">1. Goal</div>
                <div className="text-[9px] text-gray-400">Define target</div>
              </div>
              <div className="p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl space-y-1">
                <div className="w-7 h-7 rounded-lg bg-[#eae7f5] dark:bg-[#232042] text-[#7570ab] dark:text-[#b0aee0] mx-auto flex items-center justify-center">
                  <Layers size={15} />
                </div>
                <div className="font-bold text-[11px]">2. Structure</div>
                <div className="text-[9px] text-gray-400">Phases & Topics</div>
              </div>
              <div className="p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl space-y-1">
                <div className="w-7 h-7 rounded-lg bg-[#e3f3ee] dark:bg-[#1c3a32] text-[#2f6b5c] dark:text-[#7fd1b9] mx-auto flex items-center justify-center">
                  <CheckSquare size={15} />
                </div>
                <div className="font-bold text-[11px]">3. Action</div>
                <div className="text-[9px] text-gray-400">Daily focus tasks</div>
              </div>
              <div className="p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl space-y-1">
                <div className="w-7 h-7 rounded-lg bg-[#f5ecdb] dark:bg-[#3a2c14] text-[#8a5a24] dark:text-[#dcb579] mx-auto flex items-center justify-center">
                  <Sliders size={15} />
                </div>
                <div className="font-bold text-[11px]">4. Mastery</div>
                <div className="text-[9px] text-gray-400">Dual Progress</div>
              </div>
            </div>
          </div>
        )}

        {/* SCREEN 2: DOMAIN DIVERSITY */}
        {step === 2 && (
          <div className="space-y-4 animate-fadeIn">
            <div className="text-center">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                Works for Any Skill or Domain
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Learning Hub is completely domain-independent — no hardcoded courses or rigid subjects.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-[#e4ecf5]/60 dark:bg-[#182a40]/50 border border-[#e4ecf5] dark:border-[#182a40] rounded-2xl space-y-1">
                <Code size={20} className="text-[#2f5378] dark:text-[#8fb4d9]" />
                <div className="font-bold text-xs text-gray-900 dark:text-white">Software & AI</div>
                <div className="text-[10px] text-gray-500">DSA, Full Stack, ML models</div>
              </div>
              <div className="p-3 bg-[#eae7f5]/60 dark:bg-[#232042]/50 border border-[#eae7f5] dark:border-[#232042] rounded-2xl space-y-1">
                <Video size={20} className="text-[#7570ab] dark:text-[#b0aee0]" />
                <div className="font-bold text-xs text-gray-900 dark:text-white">Video Editing</div>
                <div className="text-[10px] text-gray-500">Premiere, DaVinci, Color LUTs</div>
              </div>
              <div className="p-3 bg-[#f5ecdb]/60 dark:bg-[#3a2c14]/50 border border-[#f5ecdb] dark:border-[#3a2c14] rounded-2xl space-y-1">
                <Music size={20} className="text-[#8a5a24] dark:text-[#dcb579]" />
                <div className="font-bold text-xs text-gray-900 dark:text-white">Music & Instruments</div>
                <div className="text-[10px] text-gray-500">Guitar chords, Piano, Vocal</div>
              </div>
              <div className="p-3 bg-[#e3f3ee]/60 dark:bg-[#1c3a32]/50 border border-[#e3f3ee] dark:border-[#1c3a32] rounded-2xl space-y-1">
                <Languages size={20} className="text-[#2f6b5c] dark:text-[#7fd1b9]" />
                <div className="font-bold text-xs text-gray-900 dark:text-white">Languages</div>
                <div className="text-[10px] text-gray-500">Japanese, Spanish, Kanji</div>
              </div>
              <div className="p-3 bg-[#f7e8e6]/60 dark:bg-[#3a201d]/50 border border-[#f7e8e6] dark:border-[#3a201d] rounded-2xl space-y-1">
                <Palette size={20} className="text-[#b3574f] dark:text-[#e2a8a3]" />
                <div className="font-bold text-xs text-gray-900 dark:text-white">UI/UX & Design</div>
                <div className="text-[10px] text-gray-500">Figma, 3D Blender, Typography</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl flex items-center justify-center text-center">
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Any Custom Goal</span>
              </div>
            </div>

            <div className="p-3 bg-[#eae7f5]/70 dark:bg-[#232042]/50 border border-[#eae7f5] dark:border-[#232042] rounded-xl text-xs space-y-1">
              <div className="font-bold text-[#4b4a8a] dark:text-[#b0aee0] flex items-center gap-1.5">
                <Sliders size={14} className="text-[#7570ab]" /> Dual Progress System
              </div>
              <p className="text-[11px] text-[#4b4a8a] dark:text-[#b0aee0]">
                1. <strong>Completion Progress</strong> is auto-calculated from finished tasks.
                <br />
                2. <strong>Personal Understanding / Mastery</strong> is set manually by you to measure your true confidence.
              </p>
            </div>
          </div>
        )}

        {/* SCREEN 3: INTERACTIVE REAL-WORLD EXAMPLE */}
        {step === 3 && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Real-World Journey Example
                </h3>
                <p className="text-xs text-gray-500">Select a domain below to see how a complete journey looks:</p>
              </div>

              {/* Example Selector Pills */}
              <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                {EXAMPLE_JOURNEYS.map((ex, idx) => {
                  const Icon = ex.icon;
                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedExampleIndex(idx)}
                      className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors ${
                        idx === selectedExampleIndex
                          ? 'bg-white dark:bg-gray-900 text-[#3d7a75] dark:text-[#5fae9e] shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-800'
                      }`}
                    >
                      <Icon size={12} /> {ex.domain.split('/')[0]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Simulated Live Journey Card */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 rounded-2xl space-y-3 font-sans text-xs">
              <div className="flex items-start justify-between gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
                <div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#e3f3ee] dark:bg-[#1c3a32] text-[#2f6b5c] dark:text-[#7fd1b9]">
                    {selectedExample.domain}
                  </span>
                  <h4 className="font-extrabold text-sm text-gray-900 dark:text-white mt-1">
                    {selectedExample.title}
                  </h4>
                  <p className="text-[11px] text-gray-500 italic">Goal: {selectedExample.goal}</p>
                </div>
                <span className="text-[10px] font-semibold text-[#7570ab] bg-[#eae7f5] dark:bg-[#232042] px-2 py-0.5 rounded-full">
                  {selectedExample.structure}
                </span>
              </div>

              {/* Roadmap Phases & Topics */}
              <div className="space-y-3 max-h-52 overflow-y-auto pr-1">
                {selectedExample.phases.map((phase, pIdx) => (
                  <div key={pIdx} className="space-y-2">
                    <div className="font-bold text-xs text-[#7570ab] dark:text-[#b0aee0] flex items-center gap-1.5">
                      <Layers size={13} /> {phase.name}
                    </div>

                    <div className="pl-3 space-y-2 border-l-2 border-[#7570ab]/30 dark:border-[#b0aee0]/30">
                      {phase.topics.map((topic, tIdx) => (
                        <div key={tIdx} className="p-2.5 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-gray-800 dark:text-gray-200">{topic.name}</span>
                            <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-[#e4ecf5] text-[#2f5378] dark:bg-[#182a40] dark:text-[#8fb4d9]">
                              {topic.status}
                            </span>
                          </div>

                          {/* Progress indicators */}
                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            <div>
                              <span className="text-gray-400">Completion: {topic.completion}%</span>
                              <div className="h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden mt-0.5">
                                <div className="h-full bg-[#5fae9e]" style={{ width: `${topic.completion}%` }} />
                              </div>
                            </div>
                            <div>
                              <span className="text-[#7570ab] dark:text-[#b0aee0]">Mastery: {topic.mastery}%</span>
                              <div className="h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden mt-0.5">
                                <div className="h-full bg-[#7570ab] dark:bg-[#b0aee0]" style={{ width: `${topic.mastery}%` }} />
                              </div>
                            </div>
                          </div>

                          {/* Tasks */}
                          <div className="pt-1 text-[10px] text-gray-500 space-y-0.5">
                            {topic.tasks.map((tk, tkIdx) => (
                              <div key={tkIdx} className="flex items-center gap-1">
                                <CheckSquare size={10} className="text-[#2f6b5c] dark:text-[#7fd1b9]" /> {tk}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Modal Action Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-800 mt-4">
          <button
            onClick={handleClose}
            className="text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 px-3 py-2"
          >
            Explore Dashboard
          </button>

          <div className="flex items-center gap-2">
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="text-xs font-medium text-gray-600 hover:bg-[#eef2f4] dark:text-gray-300 dark:hover:bg-[#222b33] px-3.5 py-2 rounded-xl transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="flex items-center gap-1.5 text-xs font-semibold bg-[#3d7a75] hover:bg-[#2f5f5b] dark:bg-[#5fae9e] dark:hover:bg-[#4c9484] text-white dark:text-[#0e2320] px-5 py-2.5 rounded-xl shadow-sm transition-all"
            >
              {step === 3 ? 'Start Creating Journey' : 'Next'} <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
