
import React, { useState, useEffect, Suspense } from 'react';
import Header from './components/Header';
const PlayerInputForm = React.lazy(() => import('./components/PlayerInputForm'));
const AnalysisResultView = React.lazy(() => import('./components/AnalysisResult'));
import { PlayerProfile, AnalysisResult, SchoolMode } from './types';
import { analyzeExposure } from './services/geminiService';
import { GraduationCap, Users, ShieldCheck, X, Globe, ArrowRight } from 'lucide-react';
import { isSchoolSlug, leadReferralSource } from './lib/school-mode.js';
const FeedbackWidget = React.lazy(() => import('./components/FeedbackWidget').then(m => ({ default: m.FeedbackWidget })));

// Google Analytics gtag type declaration
declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

const MethodologyOverlay = ({ onClose }: { onClose: () => void }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-sm animate-fade-in print:hidden">
    <div className="bg-white dark:bg-slate-900 w-full max-w-2xl max-h-[85vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 flex flex-col relative animate-slide-up">
      <button 
        onClick={onClose}
        className="absolute top-4 right-4 p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
      >
        <X className="w-5 h-5" />
      </button>
      
      <div className="p-6 md:p-8 border-b border-slate-200 dark:border-white/5">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Algorithm Methodology</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Transparency in our predictive modeling.</p>
      </div>
      
      <div className="overflow-y-auto p-6 md:p-8 space-y-6 text-slate-700 dark:text-slate-300 leading-relaxed text-sm">
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500/20 rounded-lg text-xs">
          <strong>Disclaimer:</strong> These results are based purely on user inputs and our proprietary modeling logic. They serve as an objective orientation tool, not a guarantee of recruitment.
        </div>

        <p>
          The ExposureEngine Algorithm applies an advanced multivariate predictive architecture engineered to replicate the decision logic of a US collegiate recruiting director. Instead of simple chance calculators, it utilizes a weighted scoring matrix based on historical recruiting data, roster composition analytics, and NCAA/NAIA eligibility standards.
        </p>

        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Phase 1: The "On-Paper" Baseline</h3>
          <p>
            The starting point is the player’s competitive environment. The algorithm assigns an initial Visibility Score based on how the league tier compares to the target college division. A Minutes Coefficient then adjusts this baseline based on role dynamics: players who consistently play more than 70 percent of available minutes receive a moderate positive adjustment, while players appearing in less than 30 percent of minutes receive a reduced weighting on their league tier. Awards or recognitions at the state, regional, or national level provide an additional boost to the score.
          </p>
        </div>

        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Phase 2: Athletic & Academic Filters</h3>
          <p>
            Academic benchmarks help determine overall admissibility, with lower GPAs reducing access to more selective divisions and programs. Athletic metrics are standardized, and average ratings lower the likelihood of placement in higher divisions that typically expect above average or elite profiles.
          </p>
        </div>

        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Phase 3: Market Reality Multiplier</h3>
          <ul className="space-y-2">
             <li><strong className="text-slate-900 dark:text-white">Video Binary:</strong> No video results in a 0.6x penalty (40% reduction) across all levels.</li>
             <li><strong className="text-slate-900 dark:text-white">Funnel Logic:</strong> High outreach with low replies flags "Spamming" or "Talent Gap". Zero outreach triggers "Invisible" status.</li>
          </ul>
        </div>

        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Phase 4: Maturity & Experience</h3>
          <p>
            Players with verified semi-pro or international academy experience, as well as those further along in their development, receive a modest scoring boost for higher divisions to reflect typical college coach preferences for more ready-made profiles.
          </p>
        </div>
        
        <div className="pt-4 border-t border-slate-200 dark:border-white/5">
           <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Scoring Key</h3>
           <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded border border-emerald-200 dark:border-emerald-500/20">
                 <span className="font-bold text-emerald-700 dark:text-emerald-400 block">90-100%</span>
                 Ideal Fit. Expect offers.
              </div>
              <div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded border border-amber-200 dark:border-amber-500/20">
                 <span className="font-bold text-amber-700 dark:text-amber-400 block">70-89%</span>
                 Possible. Needs optimization.
              </div>
              <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded border border-red-200 dark:border-red-500/20">
                 <span className="font-bold text-red-700 dark:text-red-400 block">&lt; 50%</span>
                 Misalignment / Blocker.
              </div>
           </div>
        </div>
      </div>
    </div>
  </div>
);

const App: React.FC = () => {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null;
    return saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  });
  const [showMethodology, setShowMethodology] = useState(false);
  const [school, setSchool] = useState<SchoolMode | null>(null);

  // Confirmed school links tag saved leads; scout referrals stay separate and take priority.
  const [schoolSlug] = useState(() => new URLSearchParams(window.location.search).get('school'));
  useEffect(() => {
    if (!isSchoolSlug(schoolSlug)) return;
    const controller = new AbortController();
    fetch(`/api/school?slug=${encodeURIComponent(schoolSlug!)}`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (data) setSchool(data as SchoolMode); })
      .catch(() => {}); // Unknown or unavailable schools use the normal evaluation.
    return () => controller.abort();
  }, [schoolSlug]);

  // Capture referral scout ID from URL (e.g., ?ref=<scoutId>)
  const [referralScoutId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('ref') || null;
  });

  // Apply theme class when theme changes
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  useEffect(() => {
    if (error) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [error]);

  const handleFormSubmit = async (submittedProfile: PlayerProfile) => {
    setProfile(submittedProfile);
    setIsLoading(true);
    setError(null);

    // GA4: Lead captured
    window.gtag?.('event', 'generate_lead', {
      site: 'exposure-engine-olive.vercel.app',
      form_name: 'player_visibility_assessment',
    });

    try {
      // Include scout referral ID in profile sent to API
      const profileWithRef = referralScoutId
        ? { ...submittedProfile, referralScoutId }
        : submittedProfile;
      const result = await analyzeExposure(profileWithRef);
      setAnalysisResult(result);

      // GA4: Analysis completed
      window.gtag?.('event', 'analysis_complete', {
        site: 'exposure-engine-olive.vercel.app',
        form_name: 'visibility_calculator',
        sport: 'soccer',
      });

      // Fire-and-forget save to Supabase (lazy-loaded to reduce main bundle)
      const leadData = {
        email: submittedProfile.email || null,
        first_name: submittedProfile.firstName,
        last_name: submittedProfile.lastName,
        source: 'exposure-engine',
        gender: submittedProfile.gender,
        date_of_birth: submittedProfile.dateOfBirth || null,
        citizenship: submittedProfile.citizenship,
        position: submittedProfile.position,
        height: submittedProfile.height,
        dominant_foot: submittedProfile.dominantFoot,
        experience_level: submittedProfile.experienceLevel,
        video_type: submittedProfile.videoType,
        gpa: submittedProfile.academics.gpa,
        test_score: submittedProfile.academics.testScore || null,
        grad_year: String(submittedProfile.gradYear),
        state_region: submittedProfile.state,
        athletic_profile: submittedProfile.athleticProfile,
        seasons: submittedProfile.seasons,
        exposure_events: submittedProfile.events,
        coaches_contacted: submittedProfile.coachesContacted,
        responses_received: submittedProfile.responsesReceived,
        offers_received: submittedProfile.offersReceived,
        analysis_result: result,
        visibility_scores: Object.fromEntries(
          result.visibilityScores.map((v: any) => [v.level.toLowerCase(), v.visibilityPercent])
        ),
        referral_source: leadReferralSource(referralScoutId, school ? schoolSlug : null),
      };
      const { supabase } = await import('./services/supabase');
      if (leadData.email) {
        // Upsert via RPC - increments submission_count on re-submissions
        supabase.rpc('upsert_website_lead', { lead_data: leadData }).then(({ data }) => {
          // Only notify on first submission, always sync profile data to Brevo
          supabase.functions.invoke('sync-lead-to-brevo', {
            body: { ...leadData, is_new: data?.is_new ?? true }
          }).catch(() => {});
        });
      } else {
        supabase.from('website_leads').insert(leadData).then(() => {});
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      console.error("Analysis Error Details:", err);
      let errorMessage = "Failed to analyze profile. Please check your API key and try again.";
      if (err instanceof Error) {
        errorMessage += ` (${err.message})`;
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setAnalysisResult(null);
    setProfile(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-emerald-500/30 overflow-x-hidden relative transition-colors duration-300">
      {/* Background Ambience — blur hidden on mobile (GPU-intensive) */}
      <div className="fixed inset-0 z-0 pointer-events-none print:hidden hidden md:block">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-200/20 dark:bg-emerald-900/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-200/20 dark:bg-blue-900/10 rounded-full blur-[120px]"></div>
      </div>

      <Header toggleTheme={toggleTheme} isDark={theme === 'dark'} />
      
      <main className="relative z-10 max-w-4xl mx-auto px-4 py-12">
        {error && (
          <div className="mb-8 p-4 bg-red-100 dark:bg-red-950/30 border border-red-200 dark:border-red-500/20 rounded-xl flex items-center text-red-800 dark:text-red-200 text-sm backdrop-blur-sm">
             <span className="font-bold mr-2">Error:</span> {error}
          </div>
        )}

        {!analysisResult ? (
          <div className="space-y-8 animate-fade-in">
             {school && (
               <div className="rounded-xl border-l-4 bg-white p-5 dark:bg-slate-900"
                 style={{ borderColor: school.primaryColor }}>
                 <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: school.primaryColor }}>Player check by Warubi</p>
                 <p className="mt-1 text-lg font-bold">Your path to {school.name}</p>
                 <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Warubi prepares this check from your answers. {school.shortName} coaches see players in person at their ID showcase.</p>
               </div>
             )}
             <div className="text-center mb-10">
               <h2 className="text-3xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight leading-tight">
                 What level would a college <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-600 dark:from-emerald-400 dark:to-teal-500">coach put you at today?</span>
               </h2>
               <p className="text-slate-600 dark:text-slate-400 max-w-xl mx-auto text-lg leading-relaxed">
                 Get transparent, unbiased feedback on where you really stand. Answer a few quick questions about your league, minutes, grades, and video to get an honest visibility score and 90 day plan.
               </p>
               
               <div className="mt-8 flex justify-center space-x-8 text-xs font-mono text-slate-500 uppercase tracking-widest">
                  <span>MLS NEXT</span>
                  <span className="text-slate-400 dark:text-slate-700">•</span>
                  <span>ECNL</span>
                  <span className="text-slate-400 dark:text-slate-700">•</span>
                  <span>GA</span>
                  <span className="text-slate-400 dark:text-slate-700">•</span>
                  <span>USL Academy</span>
               </div>
             </div>

             <Suspense fallback={
               <div className="space-y-6 animate-pulse">
                 <div className="h-10 w-40 ml-auto bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
                 <div className="h-[600px] bg-slate-200/60 dark:bg-slate-800/40 rounded-2xl"></div>
                 <div className="h-48 bg-slate-200/60 dark:bg-slate-800/40 rounded-2xl"></div>
               </div>
             }>
               <PlayerInputForm onSubmit={handleFormSubmit} isLoading={isLoading} />
             </Suspense>

             {/* Credibility Section */}
             {!school && <div className="mt-24 border-t border-slate-200 dark:border-white/5 pt-12">
                <div className="text-center mb-10">
                  <div className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-widest mb-3">
                    Powered by Warubi Sports
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Elite Pathways. Global Reach.</h3>
                  <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto text-sm leading-relaxed mb-6">
                    Warubi Sports provides pathways into NCAA, NAIA, and JuCo soccer, collaborates with pro agents across the world, develops players in a Bundesliga academy, and supports coaches in earning UEFA licenses.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto mb-10">
                    <div className="bg-white/50 dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-white/5 text-center hover:bg-white dark:hover:bg-slate-900/60 transition-colors group shadow-sm">
                       <div className="w-10 h-10 mx-auto bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-3 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-500/20 transition-colors">
                          <GraduationCap className="w-5 h-5 text-slate-500 dark:text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
                       </div>
                       <div className="text-3xl font-bold text-slate-900 dark:text-white mb-1 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">1,000+</div>
                       <div className="text-xs text-slate-500 font-mono uppercase tracking-wider">College & Semi-Pro Placements</div>
                    </div>
                     <div className="bg-white/50 dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-white/5 text-center hover:bg-white dark:hover:bg-slate-900/60 transition-colors group shadow-sm">
                       <div className="w-10 h-10 mx-auto bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-3 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-500/20 transition-colors">
                          <Users className="w-5 h-5 text-slate-500 dark:text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
                       </div>
                       <div className="text-3xl font-bold text-slate-900 dark:text-white mb-1 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">500+</div>
                       <div className="text-xs text-slate-500 font-mono uppercase tracking-wider">Licensed Coaches Network</div>
                    </div>
                     <div className="bg-white/50 dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-200 dark:border-white/5 text-center hover:bg-white dark:hover:bg-slate-900/60 transition-colors group shadow-sm">
                       <div className="w-10 h-10 mx-auto bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-3 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-500/20 transition-colors">
                          <ShieldCheck className="w-5 h-5 text-slate-500 dark:text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
                       </div>
                       <div className="text-xl font-bold text-slate-900 dark:text-white mb-1 pt-1.5 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">TRUSTED</div>
                       <div className="text-xs text-slate-500 font-mono uppercase tracking-wider mt-0.5">FIFA Agents & Bundesliga Academies</div>
                    </div>
                </div>
                
                <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-[11px] font-medium text-slate-500 uppercase tracking-wide">
                    <span className="flex items-center"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-2"></span>Built with College Coaches</span>
                    <span className="flex items-center"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-2"></span>FIFA-Licensed Agents</span>
                    <span className="flex items-center"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-2"></span>UEFA Licensed Educators</span>
                </div>

                <div className="mt-8 flex justify-center">
                  <a
                    href="https://warubi-sports.com/eliteplayer-pathways/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center px-8 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <Globe className="w-4 h-4 mr-2" />
                    Explore Elite Pathways
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </a>
                </div>
             </div>}

          </div>
        ) : (
          <Suspense fallback={
            <div className="flex items-center justify-center py-24">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent"></div>
            </div>
          }>
            <AnalysisResultView result={analysisResult} profile={profile!} onReset={handleReset} isDark={theme === 'dark'} school={school} />
          </Suspense>
        )}
      </main>

      <footer className="relative z-10 py-8 text-center font-mono print:hidden">
        <div className="flex flex-col items-center space-y-2">
            <p className="text-[10px] text-slate-500 dark:text-slate-600">© {new Date().getFullYear()} ExposureEngine by Warubi Sports Analytics.</p>
            <button onClick={() => setShowMethodology(true)} className="text-[10px] text-slate-400 hover:text-emerald-500 transition-colors underline decoration-slate-700 underline-offset-2">
                Learn how the score is calculated
            </button>
        </div>
      </footer>

      {showMethodology && <MethodologyOverlay onClose={() => setShowMethodology(false)} />}

      <Suspense fallback={null}>
        <FeedbackWidget />
      </Suspense>
    </div>
  );
};

export default App;
