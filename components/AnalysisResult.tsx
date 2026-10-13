import React, { useState, useRef } from 'react';
import { AnalysisResult, RiskFlag, ActionItem, PlayerProfile, BenchmarkMetric, SchoolMode } from '../types';
import { chooseSchoolStep, showEstimatedCaliber } from '../lib/school-mode.js';
// supabase imported dynamically in handleEmailSubmit to reduce chunk size
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ReferenceLine, Legend
} from 'recharts';
import {
  AlertTriangle, CheckCircle2, Calendar, ArrowRight, Shield,
  Download, Share2, TrendingUp, Activity, Minus,
  AlertCircle, Info, Zap, User, Target, Globe, Trophy, Mail, X, Eye,
  Brain, Dumbbell, Video, BookOpen
} from 'lucide-react';

interface Props {
  result: AnalysisResult;
  profile: PlayerProfile;
  onReset: () => void;
  isDark: boolean;
  school?: SchoolMode | null;
}

const PrintHeader = ({ profile }: { profile: PlayerProfile }) => {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <div className="print-header mb-2 bg-white">
      <div className="h-0.5 w-full bg-gradient-to-r from-emerald-500 via-blue-500 to-emerald-500 rounded-full mb-3"></div>
      <div className="flex justify-between items-end pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 leading-tight">Exposure<span className="text-emerald-600">Engine</span></h1>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-medium mt-0.5">Self-Assessment Report</p>
        </div>
        <div className="text-right">
          <h2 className="text-lg font-bold text-slate-800">{profile.firstName} {profile.lastName}</h2>
          <p className="text-[11px] text-slate-500">Class of {profile.gradYear} • {profile.position}{profile.height ? ` • ${profile.height}` : ''}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{dateStr} • <span className="text-amber-600 font-semibold">Based on self-reported data</span></p>
        </div>
      </div>
    </div>
  );
};

const PrintFooter = () => (
  <div className="print-footer">
    <span>ExposureEngine by Warubi Sports</span>
    <span>Confidential</span>
  </div>
);

const AnalysisResultView: React.FC<Props> = ({ result, profile, onReset, isDark, school }) => {
  const [viewMode, setViewMode] = useState<'player' | 'coach'>('player');
  
  // Email Modal State
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [email, setEmail] = useState('');
  const [isEmailSending, setIsEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // PDF generation
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Info State for Radar Charts
  const [showVisibilityInfo, setShowVisibilityInfo] = useState(false);

  // Defensive Coding: Ensure we have arrays even if API returns undefined
  const visibilityScores = result.visibilityScores || [];
  const keyRisks = result.keyRisks || [];
  const rawActionPlan = result.actionPlan || [];
  const estimatedCaliber = result.estimatedCaliber;
  const funnelAnalysis = result.funnelAnalysis || {
    stage: 'Evaluation', conversionRate: '0%', bottleneck: 'Unknown', advice: 'Review data'
  };
  const benchmarkAnalysis = result.benchmarkAnalysis || [];
  const readinessScore = result.readinessScore || {
    athletic: 50, technical: 50, tactical: 50, academic: 50, market: 50
  };
  const verifiedReadiness = result.verifiedReadiness;
  const gapFactors = result.gapFactors;

  // Helper to normalize level names (e.g. "NCAA D1" -> "D1") for consistent sorting and mapping
  const normalizeLevel = (level: string) => {
    if (!level) return '';
    return level.replace(/NCAA\s*/i, '').trim();
  };

  // Sort visibility scores safely for the chart data
  const sortedVisibility = [...visibilityScores].sort((a, b) => {
    const order: Record<string, number> = { 'D1': 5, 'D2': 4, 'D3': 3, 'NAIA': 2, 'JUCO': 1 };
    const scoreA = order[normalizeLevel(a.level)] || 0;
    const scoreB = order[normalizeLevel(b.level)] || 0;
    return scoreB - scoreA;
  });
  
  // For Radar Chart: Visibility Profile
  const radarData = [
      { level: 'D1', fullMark: 100, visibilityPercent: visibilityScores.find(v => normalizeLevel(v.level) === 'D1')?.visibilityPercent || 0 },
      { level: 'D2', fullMark: 100, visibilityPercent: visibilityScores.find(v => normalizeLevel(v.level) === 'D2')?.visibilityPercent || 0 },
      { level: 'D3', fullMark: 100, visibilityPercent: visibilityScores.find(v => normalizeLevel(v.level) === 'D3')?.visibilityPercent || 0 },
      { level: 'NAIA', fullMark: 100, visibilityPercent: visibilityScores.find(v => normalizeLevel(v.level) === 'NAIA')?.visibilityPercent || 0 },
      { level: 'JUCO', fullMark: 100, visibilityPercent: visibilityScores.find(v => normalizeLevel(v.level) === 'JUCO')?.visibilityPercent || 0 },
  ];

  // Logic to enforce Video Action Item presence
  const finalActionPlan = React.useMemo(() => {
    let plan = [...rawActionPlan];
    
    // 1. Handle Video Item (Critical - ALWAYS PREPEND)
    // First, remove any generic video advice from the AI to avoid duplicates
    const videoKeywords = ['video', 'highlight', 'reel', 'film', 'footage'];
    plan = plan.filter(item => !videoKeywords.some(k => item.description.toLowerCase().includes(k)));

    let videoAdvice = "";
    if (profile.videoType === "None") {
        videoAdvice = "URGENT: Create a highlight video. You cannot be recruited without one. Record your next 3 matches and produce a 3-5 minute reel immediately.";
    } else if (profile.videoType === "Raw_Game_Footage") {
        videoAdvice = "Optimize your footage. Coaches rarely watch full games. Edit your raw footage into a concise 3-5 minute highlight reel focusing on your best moments.";
    } else {
        videoAdvice = "Professionalize your reel. Even with a video, optimization is key. Ensure the first 30 seconds are your absolute best clips. Remove intro music/graphics. Update with recent play against high-level opposition.";
    }

    const videoActionItem: ActionItem = {
      timeframe: 'Next_30_Days',
      impact: 'High',
      description: videoAdvice
    };
    
    // Always add video advice as the first item
    plan.unshift(videoActionItem);

    // 2. Handle International/Maturity Suggestion (Subtle/Medium)
    const maturityKeywords = ['international', 'abroad', 'adult league', 'men\'s league', 'upsl', 'npsl', 'semi-pro'];
    const hasMaturityItem = plan.some(item => 
      maturityKeywords.some(k => item.description.toLowerCase().includes(k))
    );

    const alreadyHasExperience =
        profile.experienceLevel.includes('Semi_Pro_UPSL_NPSL_WPSL') ||
        profile.experienceLevel.includes('International_Academy_U19') ||
        profile.experienceLevel.includes('Pro_Academy_Reserve');

    if (!hasMaturityItem && !alreadyHasExperience) {
         const maturityItem: ActionItem = {
            timeframe: 'Next_90_Days',
            impact: 'Medium',
            description: "Differentiation: Consider international training or adult leagues (UPSL/NPSL). Gaining experience outside the standard youth system signals maturity and college readiness to coaches."
        };
        // Insert as 3rd item (index 2) to be subtle but visible
        plan.splice(2, 0, maturityItem);
    }
    
    return plan.slice(0, 5); // Ensure list doesn't get too long
  }, [rawActionPlan, profile.videoType, profile.experienceLevel]);

  // Helper for Impact Badges
  const getImpactBadge = (impact: string) => {
    switch(impact) {
      case 'High': 
        return { 
          color: 'text-amber-500 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20', 
          icon: TrendingUp, 
          label: 'High Impact' 
        };
      case 'Medium': 
        return { 
          color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20', 
          icon: Activity, 
          label: 'Med Impact' 
        };
      default: 
        return { 
          color: 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/50', 
          icon: Minus, 
          label: 'Low Impact' 
        };
    }
  };

  // Helper for Probability Status
  const getProbabilityStatus = (score: number) => {
    if (score < 25) return { label: 'Off the Radar', color: '#ef4444', textClass: 'text-red-500' };
    if (score < 50) return { label: 'Limited Reach', color: '#f97316', textClass: 'text-orange-500' };
    if (score < 75) return { label: 'Building', color: '#eab308', textClass: 'text-yellow-600 dark:text-yellow-500' };
    return { label: 'On Their Radar', color: '#10b981', textClass: 'text-emerald-600 dark:text-emerald-500' };
  };
  
  // Helper to format citizenship list
  const formatCitizenship = (p: PlayerProfile) => {
    if (!p.citizenship || !Array.isArray(p.citizenship)) return p.citizenship || "N/A";
    const main = p.citizenship.filter(c => c !== 'Other');
    if (p.citizenship.includes('Other') && p.otherCitizenship) {
      main.push(p.otherCitizenship);
    }
    return main.length > 0 ? main.join(', ') : "N/A";
  };

  // Helper for Readiness Pillars Feedback
  const getReadinessContext = (category: string, score: number) => {
    let status = "";
    let color = "";
    let tip = "";

    if (score >= 90) {
      status = "Elite";
      color = "text-emerald-500";
      tip = "Ready for top-tier recruitment. Maintain and showcase.";
    } else if (score >= 70) {
      status = "Competitive";
      color = "text-blue-500";
      tip = "Solid foundation. Minor adjustments needed for elite levels.";
    } else {
      status = "Developing";
      color = "text-amber-500";
      tip = "Primary focus area. Significant room for growth.";
    }

    // Specific tips per category
    if (category === "Exposure") {
        if (score < 50) tip = "You are invisible. Priority #1: Film & Emails.";
        else if (score < 85) tip = "Good start. Increase outreach volume to convert interest.";
    }
    if (category === "Academics") {
        if (score < 70) tip = "Your GPA is limiting your options. Focus on grades to unlock D3/High D1.";
    }

    return { status, color, tip };
  };

  // Calculate Athletic Ceiling for Coach View
  const getAthleticCeiling = (score: number) => {
    if (score >= 90) return { label: "Elite (National)", color: "text-emerald-600 dark:text-emerald-400" };
    if (score >= 80) return { label: "High (Regional)", color: "text-blue-600 dark:text-blue-400" };
    if (score >= 70) return { label: "Standard", color: "text-yellow-600 dark:text-yellow-500" };
    return { label: "Developmental", color: "text-slate-500 dark:text-slate-400" };
  };

  const handleDownloadPDF = async () => {
    setIsGeneratingPDF(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas-pro'),
        import('jspdf')
      ]);

      const element = contentRef.current;
      if (!element) return;

      // Prepare for capture: switch to light mode, hide UI elements
      const wasDark = document.documentElement.classList.contains('dark');
      if (wasDark) document.documentElement.classList.remove('dark');
      element.classList.add('pdf-capture');
      // Force desktop width on mobile so html2canvas captures at 800px
      element.style.minWidth = '800px';
      element.style.width = '800px';

      // Wait for DOM reflow + Recharts ResponsiveContainer re-render
      await new Promise(r => setTimeout(r, 1200));

      // Capture each section individually — no section ever splits across pages
      const sectionEls = element.querySelectorAll('[data-pdf-section]');
      const captureOpts = { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false };

      // Capture header (everything before the first section)
      const headerCanvas = await html2canvas(element.querySelector('.print-header') as HTMLElement || element, {
        ...captureOpts,
        height: sectionEls[0] ? (sectionEls[0] as HTMLElement).offsetTop : 200,
      });

      const sectionCanvases: HTMLCanvasElement[] = [headerCanvas];
      for (const sec of sectionEls) {
        const canvas = await html2canvas(sec as HTMLElement, captureOpts);
        sectionCanvases.push(canvas);
      }

      // Restore layout and dark mode
      element.style.minWidth = '';
      element.style.width = '';
      element.classList.remove('pdf-capture');
      if (wasDark) document.documentElement.classList.add('dark');

      // Pack sections onto A4 pages — each section stays whole
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 12;
      const gap = 3; // mm gap between sections
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2 - 10;
      let cursorY = margin; // current Y position on current page
      let pageNum = 0;

      const pages: { img: string; x: number; y: number; w: number; h: number }[][] = [[]];

      for (const canvas of sectionCanvases) {
        const aspectRatio = canvas.height / canvas.width;
        let imgW = usableWidth;
        let imgH = usableWidth * aspectRatio;
        let imgX = margin;

        // If section is taller than one page, scale it down to fit
        if (imgH > usableHeight) {
          const scale = usableHeight / imgH;
          imgH = usableHeight;
          imgW = usableWidth * scale;
          imgX = margin + (usableWidth - imgW) / 2; // center horizontally
        }

        // If section won't fit and page isn't empty, start new page
        if (cursorY + imgH > margin + usableHeight && pages[pageNum].length > 0) {
          pageNum++;
          pages.push([]);
          cursorY = margin;
        }

        pages[pageNum].push({
          img: canvas.toDataURL('image/jpeg', 0.92),
          x: imgX,
          y: cursorY,
          w: imgW,
          h: imgH,
        });
        cursorY += imgH + gap;
      }

      // Render all pages
      const totalPages = pages.length;
      for (let i = 0; i < totalPages; i++) {
        if (i > 0) pdf.addPage();
        for (const item of pages[i]) {
          pdf.addImage(item.img, 'JPEG', item.x, item.y, item.w, item.h);
        }
        // Watermark — diagonal "SELF-ASSESSMENT" across each page
        pdf.saveGraphicsState();
        pdf.setGState(new (pdf as any).GState({ opacity: 0.06 }));
        pdf.setFontSize(72);
        pdf.setTextColor(150, 150, 150);
        pdf.text('SELF-ASSESSMENT', pageWidth / 2, pageHeight / 2, {
          align: 'center',
          angle: 45,
        });
        pdf.restoreGraphicsState();
        // Footer
        pdf.setFontSize(7);
        pdf.setTextColor(148, 163, 184);
        pdf.text('ExposureEngine by Warubi Sports', margin, pageHeight - 6);
        pdf.text('Based on self-reported data - not a verified scouting evaluation', pageWidth / 2, pageHeight - 6, { align: 'center' });
        pdf.text(`${i + 1} / ${totalPages}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
      }

      // On mobile, pdf.save() opens in the same tab with no way back.
      // Use blob URL in a new tab instead.
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        const blob = pdf.output('blob');
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      } else {
        pdf.save(`ExposureEngine_${profile.firstName}_${profile.lastName}.pdf`);
      }
    } catch (err) {
      console.error('PDF generation failed:', err);
      window.print(); // Fallback
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsEmailSending(true);
    try {
      const { supabase } = await import('../services/supabase');
      await supabase.from('website_leads').upsert({
        email: email,
        first_name: profile.firstName,
        last_name: profile.lastName,
        source: 'exposure-engine',
        analysis_result: result,
        visibility_scores: Object.fromEntries(
          result.visibilityScores.map((v: any) => [v.level.toLowerCase(), v.visibilityPercent])
        ),
      }, { onConflict: 'email' });
    } catch (err) {
      console.error('Failed to save email lead', err);
    }
    setIsEmailSending(false);
    setEmailSent(true);
    setTimeout(() => {
      setShowEmailModal(false);
      setEmailSent(false);
      setEmail('');
    }, 2500);
  };

  const athleticCeiling = getAthleticCeiling(readinessScore.athletic);
  const schoolStep = school ? chooseSchoolStep(readinessScore) : null;
  const stepDetails = schoolStep === 'fc-koln-itp'
    ? {
        title: 'FC Köln ITP',
        description: 'Develop for a season in the FC Köln ITP training environment.',
        url: profile.gender === 'Female'
          ? 'https://warubi-sports.com/fccologne-itp-women/'
          : 'https://warubi-sports.com/fc-cologne-soccer-academy/',
      }
    : schoolStep === 'european-club-pathway'
      ? {
          title: 'European club pathway',
          description: 'Explore club football in Europe based on your current level.',
          url: 'https://warubi-sports.com/how-we-work/',
        }
      : {
          title: 'Warubi Verified',
          description: 'Start with Copa Score testing in the US, then attend Warubi Combine testing days in Cologne to build a verified player record.',
          // TODO: Link the dedicated Warubi Verified page when it is published.
          url: null,
        };
  const showcase = school?.showcase;
  const showcaseDate = showcase?.date
    ? new Date(`${showcase.date}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div ref={contentRef} className="w-full animate-fade-in print:p-0">
      <PrintHeader profile={profile} />
      <PrintFooter />

      {school && (
        <section data-pdf-section className="mb-6 overflow-hidden rounded-2xl border border-b-2 border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900 print:bg-white"
          style={{ borderTop: `5px solid ${school.primaryColor}`, borderBottomColor: school.secondaryColor }}>
          <div className="flex items-center gap-4 p-5 sm:p-7">
            {school.crestUrl && <img src={school.crestUrl} alt="" className="h-14 w-14 shrink-0 object-contain" />}
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: school.primaryColor }}>Player check by Warubi</p>
              <h2 className="mt-1 text-2xl font-bold leading-tight text-slate-900 dark:text-white sm:text-3xl print:text-slate-900">
                Your path to {school.name}
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 print:text-slate-700">
                Warubi prepared this check from your answers. {school.shortName} coaches see players in person at their ID showcase.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* PDF Generation Overlay */}
      {isGeneratingPDF && (
        <div className="no-print fixed inset-0 z-[100] bg-white/90 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-sm font-medium text-slate-600">Generating PDF...</p>
          </div>
        </div>
      )}

      {/* VIEW TOGGLE SWITCH */}
      <div className="no-print flex justify-between items-center mb-8">
        <button 
          onClick={onReset}
          className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center text-sm transition-colors"
        >
          <ArrowRight className="w-4 h-4 mr-2 rotate-180" /> Back to Form
        </button>

        <div className="bg-slate-100 dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-white/10 flex">
          <button
            type="button" 
            onClick={() => setViewMode('player')}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              viewMode === 'player' 
                ? 'bg-emerald-500 text-slate-900 shadow-md' 
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Player View
          </button>
          <button
            type="button" 
            onClick={() => setViewMode('coach')}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              viewMode === 'coach' 
                ? 'bg-blue-500 text-white shadow-md' 
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Coach View
          </button>
        </div>
      </div>

      {viewMode === 'coach' ? (
        /* COACH VIEW - Brutally Honest Dashboard */
        <div className="space-y-6">
           {/* PLAYER BIO STATS - SCOUTING DB STYLE */}
           <div data-pdf-section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-6 font-mono text-sm shadow-xl dark:shadow-none print:shadow-none print:border-slate-300">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-8">
                 <div>
                    <span className="block text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wider mb-1">Name</span>
                    <span className="text-slate-900 dark:text-white font-bold">{profile.lastName}, {profile.firstName}</span>
                 </div>
                 <div>
                    <span className="block text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wider mb-1">Class</span>
                    <span className="text-slate-900 dark:text-white">{profile.gradYear}</span>
                 </div>
                 <div>
                    <span className="block text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wider mb-1">Position</span>
                    <span className="text-slate-900 dark:text-white">{profile.position} {profile.secondaryPositions.length > 0 && `(${profile.secondaryPositions[0]})`}</span>
                 </div>
                 <div>
                    <span className="block text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wider mb-1">Citizenship</span>
                    <span className="text-slate-900 dark:text-white">{formatCitizenship(profile)}</span>
                 </div>
                 <div>
                    <span className="block text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wider mb-1">Height</span>
                    <span className="text-slate-900 dark:text-white">{profile.height}</span>
                 </div>
                 <div>
                    <span className="block text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wider mb-1">Dominant Foot</span>
                    <span className="text-slate-900 dark:text-white">{profile.dominantFoot}</span>
                 </div>
                 <div>
                    <span className="block text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wider mb-1">GPA</span>
                    <span className="text-slate-900 dark:text-white">{profile.academics.gpa}</span>
                 </div>
                 <div>
                    <span className="block text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wider mb-1">Athletic Ceiling</span>
                    <span className={`${athleticCeiling.color} font-bold`}>{athleticCeiling.label}</span>
                 </div>
              </div>
           </div>

           <div data-pdf-section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-6 shadow-xl dark:shadow-none print:shadow-none print:border-slate-300">
              <h3 className="text-slate-500 dark:text-slate-400 text-xs font-mono uppercase tracking-widest mb-2 flex items-center">
                 <Shield className="w-4 h-4 mr-2" /> Internal Scouting Note
              </h3>
              <p className="text-lg md:text-xl text-slate-900 dark:text-white font-medium leading-relaxed border-l-4 border-blue-500 pl-4 py-1 italic">
                 "{result.coachShortEvaluation || "Data insufficient for evaluation."}"
              </p>
           </div>

           <div data-pdf-section className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-6 shadow-sm print:shadow-none print:border-slate-300">
                 <h3 className="text-slate-900 dark:text-white font-bold mb-4">Recruiting Visibility</h3>
                 <div className="space-y-4">
                    {sortedVisibility.map((item) => (
                      <div key={item.level} className="flex items-center justify-between">
                         <span className="text-slate-500 dark:text-slate-400 font-mono text-sm w-12">{item.level}</span>
                         <div className="flex-1 mx-4 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden print:bg-slate-200">
                            <div 
                              className={`h-full rounded-full ${item.visibilityPercent > 50 ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600 print:bg-slate-600'}`}
                              style={{ width: `${item.visibilityPercent}%` }}
                            ></div>
                         </div>
                         <span className="text-slate-900 dark:text-white font-mono text-sm w-8 text-right">{item.visibilityPercent}%</span>
                      </div>
                    ))}
                 </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-6 shadow-sm print:shadow-none print:border-slate-300">
                 <h3 className="text-slate-900 dark:text-white font-bold mb-4">Key Constraints</h3>
                 <ul className="space-y-3">
                    {keyRisks.map((risk, i) => (
                       <li key={i} className="flex items-start text-sm text-slate-600 dark:text-slate-300">
                          <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 mr-2 mt-0.5 shrink-0" />
                          <span>{risk.message}</span>
                       </li>
                    ))}
                 </ul>
              </div>
           </div>
        </div>
      ) : (
        /* PLAYER VIEW - Detailed Analysis */
        <div className="space-y-6">
          
          {/* Executive Summary */}
          <div data-pdf-section className="bg-white dark:bg-slate-900/60 backdrop-blur-sm p-6 md:p-8 rounded-2xl border border-slate-200 dark:border-white/5 shadow-lg dark:shadow-xl print:shadow-none print:border-slate-300 print:bg-white">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center">
              <Zap className="w-5 h-5 mr-2 text-emerald-500 dark:text-emerald-400 print:text-emerald-600" />
              Executive Summary
            </h3>
            <p className="text-slate-600 dark:text-slate-300 text-lg leading-relaxed print:text-slate-800">
              {result.plainLanguageSummary}
            </p>
          </div>

          {/* Estimated Caliber Score */}
          {estimatedCaliber && showEstimatedCaliber(school) && (
            <div data-pdf-section className="bg-gradient-to-br from-slate-50 to-emerald-50/30 dark:from-slate-900/60 dark:to-emerald-900/10 backdrop-blur-sm p-6 md:p-8 rounded-2xl border border-emerald-200/50 dark:border-emerald-500/10 shadow-lg dark:shadow-xl print:shadow-none print:border-slate-300 print:bg-white">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center">
                  <Trophy className="w-5 h-5 mr-2 text-emerald-500 dark:text-emerald-400 print:text-emerald-600" />
                  Estimated Caliber Score
                </h3>
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-500/20">
                  Based on self-reported data
                </span>
              </div>
              <div className="flex items-center gap-6">
                <div className={`text-4xl md:text-5xl font-black tracking-tight ${
                  estimatedCaliber.label === 'Elite' ? 'text-emerald-500' :
                  estimatedCaliber.label === 'Strong' ? 'text-green-500' :
                  estimatedCaliber.label === 'Solid' ? 'text-yellow-500' :
                  estimatedCaliber.label === 'Development' ? 'text-orange-500' :
                  'text-red-400'
                }`}>
                  {estimatedCaliber.rangeLow}-{estimatedCaliber.rangeHigh}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-bold uppercase tracking-wider mb-1 ${
                    estimatedCaliber.label === 'Elite' ? 'text-emerald-500' :
                    estimatedCaliber.label === 'Strong' ? 'text-green-500' :
                    estimatedCaliber.label === 'Solid' ? 'text-yellow-500' :
                    estimatedCaliber.label === 'Development' ? 'text-orange-500' :
                    'text-red-400'
                  }`}>
                    {estimatedCaliber.label}
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    The Caliber Score measures football quality on a universal 0-100 scale.
                    Your estimated range is based on self-reported data.
                    Join the Athletes USA network for a verified, precise score.
                  </p>
                </div>
              </div>
              {/* Caliber scale bar */}
              <div className="mt-5 pt-4 border-t border-slate-200/50 dark:border-slate-700/30">
                <div className="flex items-center gap-1 h-3 rounded-full overflow-hidden">
                  <div className="h-full flex-1 bg-red-300 dark:bg-red-500/30 rounded-l-full" title="0-34 Unproven" />
                  <div className="h-full flex-1 bg-orange-300 dark:bg-orange-500/30" title="35-49 Development" />
                  <div className="h-full flex-1 bg-yellow-300 dark:bg-yellow-500/30" title="50-64 Solid" />
                  <div className="h-full flex-1 bg-green-300 dark:bg-green-500/30" title="65-79 Strong" />
                  <div className="h-full flex-1 bg-emerald-400 dark:bg-emerald-500/30 rounded-r-full" title="80-100 Elite" />
                </div>
                <div className="flex justify-between mt-1.5 text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                  <span>0</span>
                  <span>35</span>
                  <span>50</span>
                  <span>65</span>
                  <span>80</span>
                  <span>100</span>
                </div>
              </div>
            </div>
          )}

          {/* New Player Readiness Pillars */}
          <div data-pdf-section className="bg-white dark:bg-slate-900/60 backdrop-blur-sm p-6 rounded-2xl border border-slate-200 dark:border-white/5 shadow-lg dark:shadow-xl print:shadow-none print:border-slate-300 print:bg-white">
             <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center mb-6">
                <Target className="w-5 h-5 mr-2 text-emerald-500 dark:text-emerald-400 print:text-emerald-600" />
                Player Readiness Pillars
             </h3>
             
             <div className="pillars-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { label: "Physical", score: readinessScore.athletic, verified: verifiedReadiness?.athletic, icon: Dumbbell, hasVerified: true },
                  { label: "Technical", score: readinessScore.technical, verified: verifiedReadiness?.technical, icon: Activity, hasVerified: true },
                  { label: "Tactical", score: readinessScore.tactical, verified: verifiedReadiness?.tactical, icon: Brain, hasVerified: true },
                  { label: "Exposure", score: readinessScore.market, verified: undefined, icon: Video, hasVerified: false },
                  { label: "Academics", score: readinessScore.academic, verified: undefined, icon: BookOpen, hasVerified: false }
                ].map((item, idx) => {
                   const context = getReadinessContext(item.label, item.score);
                   const Icon = item.icon;
                   const gap = item.hasVerified && item.verified != null ? item.score - item.verified : 0;
                   const showVerified = item.hasVerified && item.verified != null && gap > 10;

                   return (
                     <div key={idx} className="pillar-card bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                        <div className="flex justify-between items-start mb-3">
                           <div className="flex items-center space-x-2">
                              <div className="p-1.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800">
                                <Icon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                              </div>
                              <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">{item.label}</span>
                           </div>
                           <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border ${
                              item.score >= 90 ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' :
                              item.score >= 70 ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20' :
                              'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20'
                           }`}>
                              {context.status}
                           </span>
                        </div>

                        {/* Self-assessed score */}
                        <div className="mb-2">
                           <div className="flex justify-between text-xs mb-1">
                              <span className="text-slate-400">{showVerified ? 'Your Rating' : 'Readiness Score'}</span>
                              <span className={`font-mono font-bold ${context.color}`}>{item.score}/100</span>
                           </div>
                           <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-1000 ${
                                   item.score >= 90 ? 'bg-emerald-500' : item.score >= 70 ? 'bg-blue-500' : 'bg-amber-500'
                                }`}
                                style={{ width: `${item.score}%` }}
                              ></div>
                           </div>
                        </div>

                        {/* Verified score (only for Physical/Technical/Tactical with gap > 10) */}
                        {showVerified && (
                          <div className="mb-2">
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-slate-400">Verified Level</span>
                              <span className="font-mono font-bold text-slate-400 dark:text-slate-500">{item.verified}/100</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-1000 bg-slate-400 dark:bg-slate-600"
                                style={{ width: `${item.verified}%` }}
                              ></div>
                            </div>
                          </div>
                        )}

                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug min-h-[2.5em]">
                           {showVerified
                             ? `Gap of ${gap} pts — close it with video and higher competition.`
                             : context.tip}
                        </p>
                     </div>
                   );
                })}
             </div>

             {/* Verification Gap Callout */}
             {verifiedReadiness && gapFactors && (() => {
               const avgSelf = (readinessScore.athletic + readinessScore.technical + readinessScore.tactical) / 3;
               const avgVerified = (verifiedReadiness.athletic + verifiedReadiness.technical + verifiedReadiness.tactical) / 3;
               const avgGap = avgSelf - avgVerified;
               if (avgGap <= 15) return null;

               return (
                 <div className="mt-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-500/20 rounded-xl p-4 print:bg-amber-50 print:border-amber-200">
                   <h4 className="text-sm font-bold text-amber-800 dark:text-amber-300 flex items-center mb-2">
                     <Zap className="w-4 h-4 mr-1.5" />
                     Verification Gap
                   </h4>
                   <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
                     Your self-assessed abilities are strong — but coaches can't fully verify them yet. Here's what's holding you back:
                   </p>
                   <div className="space-y-2">
                     {gapFactors.video && gapFactors.videoLabel && (
                       <div className="flex items-start text-xs text-amber-700 dark:text-amber-400">
                         <Video className="w-3.5 h-3.5 mr-2 mt-0.5 flex-shrink-0" />
                         <span>{gapFactors.videoLabel} <span className="font-semibold">(+40% verification boost)</span></span>
                       </div>
                     )}
                     {gapFactors.league && gapFactors.leagueLabel && (
                       <div className="flex items-start text-xs text-amber-700 dark:text-amber-400">
                         <Trophy className="w-3.5 h-3.5 mr-2 mt-0.5 flex-shrink-0" />
                         <span>Your league is {gapFactors.leagueLabel} <span className="font-semibold">(+25% verification boost)</span></span>
                       </div>
                     )}
                     {gapFactors.outreach && (
                       <div className="flex items-start text-xs text-amber-700 dark:text-amber-400">
                         <Mail className="w-3.5 h-3.5 mr-2 mt-0.5 flex-shrink-0" />
                         <span>Limited coach outreach — target 50-75 coaches for your level <span className="font-semibold">(increases market visibility)</span></span>
                       </div>
                     )}
                   </div>
                 </div>
               );
             })()}
          </div>

          {/* Radar Chart: Visibility Profile & Probability Grid */}
          <div data-pdf-section className="lg:col-span-2 bg-white dark:bg-slate-900/60 backdrop-blur-sm p-6 rounded-2xl border border-slate-200 dark:border-white/5 shadow-lg dark:shadow-xl flex flex-col justify-between print:shadow-none print:border-slate-300 print:bg-white">
              <div>
                <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center">
                         <Eye className="w-5 h-5 mr-2 text-emerald-500 dark:text-emerald-400 print:text-emerald-600" />
                         Visibility Profile
                      </h3>
                      <p className="text-slate-500 dark:text-slate-400 text-[11px] mt-1 ml-7">How much of the recruiting pipeline you've completed at each level — not a recruitment probability.</p>
                    </div>
                    <div className="relative no-print">
                        <button
                            onMouseEnter={() => setShowVisibilityInfo(true)}
                            onMouseLeave={() => setShowVisibilityInfo(false)}
                            className="text-slate-400 hover:text-emerald-500 transition-colors"
                        >
                            <Info className="w-4 h-4" />
                        </button>
                        {showVisibilityInfo && (
                            <div className="absolute right-0 top-6 w-72 p-3 bg-slate-800 text-white text-xs rounded-lg shadow-xl z-50 animate-fade-in border border-slate-700">
                                <h4 className="font-bold mb-2">What this score measures:</h4>
                                <p className="mb-2 text-slate-300">Each percentage reflects how much of what coaches at that level look for — league exposure, video, outreach, stats, academics — your profile currently covers.</p>
                                <h4 className="font-bold mb-2">Reading the shape:</h4>
                                <ul className="space-y-1.5 list-disc pl-3">
                                  <li><strong>Full Web:</strong> Universal recruit with options at all levels.</li>
                                  <li><strong>Dent in D3?</strong> Athletic ability is high, but grades may be limiting.</li>
                                  <li><strong>High NAIA/JUCO?</strong> Strong safety net — you qualify at these levels.</li>
                                  <li><strong>Low D1?</strong> Focus on league exposure, video quality, and direct outreach.</li>
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
                
                <div className="radar-wrap h-[300px] w-full mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                      <PolarGrid stroke={isGeneratingPDF ? "#e2e8f0" : (isDark ? "#334155" : "#e2e8f0")} />
                      <PolarAngleAxis dataKey="level" tick={{ fill: isGeneratingPDF ? '#64748b' : (isDark ? '#94a3b8' : '#64748b'), fontSize: 12, fontWeight: 700 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar name="Visibility" dataKey="visibilityPercent" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.4} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: isDark ? '#0f172a' : '#ffffff', 
                          border: isDark ? '1px solid #1e293b' : '1px solid #e2e8f0', 
                          borderRadius: '8px', 
                          color: isDark ? '#f1f5f9' : '#0f172a'
                        }}
                        itemStyle={{ color: '#3b82f6' }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Probability Grid */}
              <div className="grid grid-cols-5 gap-2 mt-2">
                 {['D1', 'D2', 'D3', 'NAIA', 'JUCO'].map((lvl) => {
                    const score = visibilityScores.find(v => normalizeLevel(v.level) === lvl)?.visibilityPercent || 0;
                    const status = getProbabilityStatus(score);

                    return (
                       <div key={lvl} className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-white/5 rounded p-2 text-center print:border-slate-300 relative group">
                          <div className="text-slate-900 dark:text-white font-bold text-xs mb-0.5">{lvl}</div>
                          <div className={`text-[10px] font-medium leading-tight mb-1 ${status.textClass}`}>
                             {status.label}
                          </div>
                       </div>
                    );
                 })}
              </div>
            </div>

          {/* Section 2: Reality Check (Benchmark Analysis) */}
          <div data-pdf-section className="bg-white dark:bg-slate-900/60 backdrop-blur-sm p-6 md:p-8 rounded-2xl border border-slate-200 dark:border-blue-500/20 shadow-lg dark:shadow-xl relative overflow-hidden group print:shadow-none print:border-slate-300 print:bg-white">
            <div className="no-print absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-blue-500 to-emerald-500 opacity-50"></div>
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Reality Check: You vs The Market</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Comparing your current profile against typical commits.</p>
              </div>
            </div>

            <div className="reality-bars flex flex-wrap md:flex-nowrap justify-around items-end w-full mb-8 px-2 md:px-4 pt-4 pb-2 gap-4">
               {benchmarkAnalysis.map((metric, idx) => {
                  const isAcademic = metric.category === "Academics";
                  
                  const score = isAcademic && metric.marketAccess !== undefined ? metric.marketAccess : metric.userScore;

                  // Unified Benchmarks Logic
                  // For Academics, we show GPA equivalents for Market Access %
                  // 100% = 4.0, 85% = 3.5, 65% = 3.0, 20% = 2.5
                  const benchmarks = isAcademic ? [
                      { label: '3.5+', val: 85, side: 'right' }, 
                      { label: '3.0+', val: 65, side: 'right' },  
                      { label: '2.5+', val: 20, side: 'right' },  
                  ] : [
                    { label: 'D1', val: metric.d1Score || 90, side: 'right' },
                    { label: 'D2', val: metric.d2Score || 80, side: 'right' },
                    { label: 'D3', val: metric.d3Score || 70, side: 'right' },
                    { label: 'NAIA', val: metric.naiaScore || 80, side: 'left' },
                    { label: 'JUCO', val: metric.jucoScore || 50, side: 'right' },
                  ];

                  return (
                    <div key={idx} className="flex flex-col items-center w-full md:w-1/3 min-h-[300px]">
                        {/* The Track */}
                        <div className="relative w-20 flex-1 bg-slate-100 dark:bg-slate-950 rounded-t-lg border-x border-t border-slate-200 dark:border-white/5 overflow-visible print:bg-slate-50 print:border-slate-300 mx-auto">
                            
                            {/* User Bar */}
                            <div 
                                className={`absolute bottom-0 left-0 right-0 rounded-t-md transition-all duration-1000 ease-out mx-2 shadow-[0_0_20px_rgba(59,130,246,0.3)] ${
                                    isAcademic 
                                    ? 'bg-gradient-to-t from-emerald-500 to-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]' 
                                    : 'bg-gradient-to-t from-blue-600 to-blue-400'
                                }`}
                                style={{ height: `${score}%` }}
                            >
                                <div className={`absolute -top-7 left-1/2 -translate-x-1/2 text-xs font-bold px-2 py-0.5 rounded border whitespace-nowrap ${
                                    isAcademic
                                    ? 'bg-slate-800 text-emerald-400 border-emerald-500/30'
                                    : 'bg-slate-800 text-blue-400 border-blue-500/30'
                                }`}>
                                    {score}{isAcademic ? '% Access' : ''}
                                </div>
                            </div>

                            {/* Benchmarks */}
                            {benchmarks.map((b, i) => (
                                <div 
                                    key={i}
                                    className="absolute w-full border-t border-dashed border-slate-400 dark:border-slate-600 left-0"
                                    style={{ bottom: `${b.val}%` }}
                                >
                                    <span 
                                      className={`absolute -top-2 text-[9px] font-mono text-slate-500 dark:text-slate-400 font-bold ${b.side === 'left' ? 'left-[-32px] text-right' : 'right-[-32px] text-left'}`}
                                    >
                                      {b.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                        
                        <div className="mt-4 text-center">
                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider block mb-2">{metric.category}</span>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight max-w-[220px] px-1 mx-auto min-h-[30px]">{metric.feedback}</p>
                        </div>
                    </div>
                  );
               })}
            </div>
          </div>

          {/* Section 3: The Funnel & Constraints */}
          <div className="funnel-grid grid grid-cols-1 md:grid-cols-2 gap-6">
             {/* Recruiting Funnel */}
             <div data-pdf-section className="bg-white dark:bg-slate-900/60 backdrop-blur-sm p-6 rounded-2xl border border-slate-200 dark:border-white/5 shadow-lg dark:shadow-xl print:shadow-none print:border-slate-300 print:bg-white">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center">
                   <Share2 className="w-5 h-5 mr-2 text-purple-500 dark:text-purple-400 print:text-purple-600" />
                   Recruiting Funnel
                </h3>
                <div className="relative pt-4 pb-8 px-4">
                   <div className="absolute left-6 top-4 bottom-8 w-0.5 bg-slate-200 dark:bg-slate-800"></div>
                   
                   <div className="relative mb-8 print:mb-3 pl-8">
                      <div className={`absolute left-0 top-1 w-3 h-3 rounded-full border-2 ${funnelAnalysis.stage === 'Invisible' ? 'bg-red-500 border-red-500' : 'bg-white dark:bg-slate-900 border-slate-400 dark:border-slate-600'}`}></div>
                      <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Outreach</h4>
                      <p className="text-slate-900 dark:text-white font-bold">{profile.coachesContacted} Coaches Contacted</p>
                   </div>

                   <div className="relative mb-8 print:mb-3 pl-8">
                      <div className={`absolute left-0 top-1 w-3 h-3 rounded-full border-2 ${funnelAnalysis.stage === 'Conversation' ? 'bg-amber-500 border-amber-500' : 'bg-white dark:bg-slate-900 border-slate-400 dark:border-slate-600'}`}></div>
                      <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Interest</h4>
                      <p className="text-slate-900 dark:text-white font-bold">{profile.responsesReceived} Replies ({funnelAnalysis.conversionRate})</p>
                   </div>

                   <div className="relative pl-8">
                      <div className={`absolute left-0 top-1 w-3 h-3 rounded-full border-2 ${funnelAnalysis.stage === 'Closing' ? 'bg-emerald-500 border-emerald-500' : 'bg-white dark:bg-slate-900 border-slate-400 dark:border-slate-600'}`}></div>
                      <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Results</h4>
                      <p className="text-slate-900 dark:text-white font-bold">{profile.offersReceived} Offers</p>
                   </div>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-500/20 p-4 rounded-lg print:border-purple-200 print:bg-purple-50">
                   <span className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase block mb-1">Funnel Diagnosis</span>
                   <p className="text-sm text-purple-900 dark:text-purple-100 print:text-purple-900">{funnelAnalysis.advice}</p>
                </div>
             </div>

             {/* Constraints & Blockers */}
             <div data-pdf-section className="bg-white dark:bg-slate-900/60 backdrop-blur-sm p-6 rounded-2xl border border-slate-200 dark:border-white/5 shadow-lg dark:shadow-xl print:shadow-none print:border-slate-300 print:bg-white">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center">
                   <AlertTriangle className="w-5 h-5 mr-2 text-amber-500 dark:text-amber-400 print:text-amber-600" />
                   Performance Constraints
                </h3>
                <div className="space-y-4">
                   {keyRisks.map((risk, idx) => (
                      <div key={idx} className={`p-4 rounded-lg border flex items-start ${
                         risk.severity === 'High' 
                           ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-500/30' 
                           : risk.severity === 'Medium'
                           ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-500/30'
                           : 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-500/30'
                      }`}>
                         <div className={`mt-0.5 mr-3 shrink-0 ${
                            risk.severity === 'High' ? 'text-red-600 dark:text-red-400' : risk.severity === 'Medium' ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'
                         }`}>
                            <AlertCircle className="w-5 h-5" />
                         </div>
                         <div>
                            <span className={`text-[10px] font-bold uppercase tracking-wider block mb-1 ${
                               risk.severity === 'High' ? 'text-red-600 dark:text-red-400' : risk.severity === 'Medium' ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'
                            }`}>
                               {risk.severity === 'High' ? 'Critical Blocker' : risk.severity === 'Medium' ? 'Warning' : 'Optimization'}
                            </span>
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase block mb-1">{risk.category}</span>
                            <p className="text-sm text-slate-700 dark:text-slate-300 leading-snug">{risk.message}</p>
                         </div>
                      </div>
                   ))}
                </div>
             </div>
          </div>

          {/* Section 4: 90 Day Game Plan */}
          <div data-pdf-section className="bg-white dark:bg-slate-900/60 backdrop-blur-sm p-6 md:p-8 rounded-2xl border border-slate-200 dark:border-white/5 shadow-lg dark:shadow-xl print:shadow-none print:border-slate-300 print:bg-white">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center">
              <Calendar className="w-6 h-6 mr-3 text-emerald-500 dark:text-emerald-400 print:text-emerald-600" />
              90 Day Game Plan
            </h3>
            <div className="space-y-4 print:space-y-2">
              {finalActionPlan.map((item, index) => {
                 // Determine if this is the Video Action Item by checking keywords
                 const videoKeywords = ['video', 'highlight', 'reel', 'film', 'footage'];
                 const isVideoAction = videoKeywords.some(k => item.description.toLowerCase().includes(k));
                 
                 const isCritical = isVideoAction; 
                 
                 const impactConfig = getImpactBadge(item.impact);
                 const ImpactIcon = impactConfig.icon;

                 return (
                  <div key={index} className={`relative p-5 print:p-3 rounded-xl border flex flex-col sm:flex-row gap-4 print:gap-2 sm:items-start transition-all ${
                     isCritical 
                     ? 'border-blue-400/50 dark:border-blue-500/50 border-dashed bg-blue-50 dark:bg-blue-900/10 shadow-[0_0_20px_rgba(59,130,246,0.1)] print:border-blue-400 print:bg-blue-50' 
                     : 'border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-950/40 hover:border-slate-300 dark:hover:border-slate-700 print:border-slate-200 print:bg-white'
                  }`}>
                    {isCritical && (
                       <div className="absolute -top-3 left-4 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-lg uppercase tracking-wider animate-pulse print:animate-none print:shadow-none">
                          Critical Action Item
                       </div>
                    )}
                    
                    {/* Timeframe Badge */}
                    <div className="flex items-center space-x-2 shrink-0 sm:w-32 mt-1">
                      <div className={`w-2 h-2 rounded-full ${isCritical ? 'bg-blue-500' : 'bg-emerald-500'}`}></div>
                      <span className={`text-xs font-mono font-bold uppercase tracking-wider ${isCritical ? 'text-blue-600 dark:text-blue-300' : 'text-slate-500 dark:text-slate-400'}`}>
                        {item.timeframe.replace(/_/g, ' ')}
                      </span>
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1">
                      <p className={`text-sm md:text-base leading-relaxed ${isCritical ? 'text-blue-900 dark:text-blue-50 font-medium print:text-blue-900' : 'text-slate-700 dark:text-slate-200 print:text-slate-800'}`}>
                        {item.description}
                      </p>
                    </div>

                    {/* Impact Badge */}
                    <div className={`shrink-0 flex items-center space-x-1.5 px-2.5 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider self-start sm:self-center ${impactConfig.color}`}>
                       <ImpactIcon className="w-3.5 h-3.5" />
                       <span>{impactConfig.label}</span>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {school && (
        <section data-pdf-section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:p-7 print:bg-white">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white print:text-slate-900">Your next steps</h3>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">School showcase</p>
              <h4 className="mt-1 text-lg font-bold text-slate-900 dark:text-white print:text-slate-900">{school.shortName} ID Showcase</h4>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300 print:text-slate-700">
                {showcase?.state === 'open'
                  ? `The school's ID showcase is open for registration${showcaseDate ? ` on ${showcaseDate}` : ''}.`
                  : showcase?.state === 'full'
                    ? `Registration is full${showcaseDate ? ` for ${showcaseDate}` : ''}.`
                    : 'The next date is being set.'}
              </p>
              {showcase?.state === 'open' && showcase.registerUrl && (
                <a href={showcase.registerUrl} target="_blank" rel="noopener noreferrer"
                  className="mt-4 inline-flex rounded-lg px-4 py-2 text-sm font-semibold text-white no-print"
                  style={{ backgroundColor: school.primaryColor }}>Register</a>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Personal step</p>
              <h4 className="mt-1 text-lg font-bold text-slate-900 dark:text-white print:text-slate-900">{stepDetails.title}</h4>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300 print:text-slate-700">{stepDetails.description}</p>
              {stepDetails.url ? (
                <a href={stepDetails.url} target="_blank" rel="noopener noreferrer"
                  className="mt-4 inline-block text-sm font-semibold underline underline-offset-4 no-print"
                  style={{ color: school.primaryColor }}>Learn more</a>
              ) : (
                <span className="mt-4 inline-block text-sm text-slate-500 no-print">More information coming soon</span>
              )}
            </div>
          </div>
        </section>
      )}

      {/* TAKE ACTION FOOTER (PDF & EMAIL) */}
      <div className="no-print mt-12 border-t border-slate-200 dark:border-white/5 pt-8">
         <div className="flex flex-col md:flex-row justify-between items-center bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 p-6 rounded-2xl border border-slate-300 dark:border-white/10 mb-4">
            <div className="mb-6 md:mb-0">
               <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Save Your Report</h3>
               <p className="text-sm text-slate-600 dark:text-slate-400">Download a PDF copy or email this self-assessment to yourself.</p>
            </div>
            <div className="flex space-x-4">
               {/* Email Button */}
               <button 
                  onClick={() => setShowEmailModal(true)}
                  className="flex items-center px-6 py-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-lg transition-colors text-sm font-bold border border-slate-200 dark:border-slate-700 shadow-sm"
               >
                  <Mail className="w-5 h-5 mr-2" />
                  Email Report
               </button>

               <button
                  onClick={handleDownloadPDF}
                  disabled={isGeneratingPDF}
                  className="flex items-center px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-wait text-white rounded-lg transition-colors text-sm font-bold shadow-lg shadow-emerald-900/20"
               >
                  {isGeneratingPDF ? (
                    <>
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span>
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5 mr-2" />
                      Download PDF
                    </>
                  )}
               </button>
            </div>
         </div>
      </div>

      {/* Email Modal */}
      {showEmailModal && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 p-6 relative animate-slide-up">
                <button 
                    onClick={() => setShowEmailModal(false)}
                    className="absolute top-4 right-4 text-slate-400 hover:text-slate-900 dark:hover:text-white"
                >
                    <X className="w-5 h-5" />
                </button>
                
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Email Your Analysis</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                    Enter your email to receive a secure link to this report and your 90-day action plan.
                </p>

                {emailSent ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center animate-fade-in">
                        <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-3">
                            <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <h4 className="text-lg font-bold text-slate-900 dark:text-white">Sent!</h4>
                        <p className="text-sm text-slate-500">Check your inbox shortly.</p>
                    </div>
                ) : (
                    <form onSubmit={handleEmailSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Email Address</label>
                            <input 
                                type="email" 
                                required
                                placeholder="name@example.com"
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <button 
                            type="submit"
                            disabled={isEmailSending}
                            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold transition-all flex items-center justify-center"
                        >
                            {isEmailSending ? (
                                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                            ) : (
                                "Send Report"
                            )}
                        </button>
                    </form>
                )}
            </div>
        </div>
      )}

      {/* MOBILE STICKY FOOTER CTA */}
      {!school && <div className="no-print fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-r from-emerald-600 to-emerald-500 backdrop-blur-md border-t border-emerald-400/30 md:hidden z-50 animate-slide-up shadow-2xl shadow-emerald-900/30">
        <a
            href="https://warubi-sports.com/eliteplayer-pathways/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between w-full px-4 py-3 bg-white/15 hover:bg-white/20 text-white rounded-xl font-bold text-sm backdrop-blur-sm border border-white/20"
        >
            <div className="flex items-center">
              <Globe className="w-4 h-4 mr-2" />
              <span>Elite Pathways</span>
            </div>
            <div className="flex items-center">
               Get Help <ArrowRight className="w-4 h-4 ml-1" />
            </div>
        </a>
      </div>}

      {/* DESKTOP WARUBI PATHWAYS CTA */}
      {!school && <div className="no-print mt-12 mb-12 relative group cursor-pointer hidden md:block">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500/20 to-blue-500/20 rounded-2xl blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
        <div className="relative bg-slate-900 border border-white/10 rounded-2xl p-8 md:p-10 flex flex-col md:flex-row items-center justify-between gap-8 overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
            
            <div className="relative z-10 text-center md:text-left">
              <div className="inline-flex items-center space-x-2 text-emerald-400 mb-3">
                  <Globe className="w-4 h-4" />
                  <span className="text-xs font-mono uppercase tracking-widest font-bold">College, International, and Pro Level</span>
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Warubi Sports Elite Pathways</h3>
              <p className="text-slate-400 max-w-lg text-sm leading-relaxed">
                  Beyond analytics, we provide direct access to professional development. Exclusive residential academies in Germany, FIFA-licensed agency representation, and UEFA coaching education.
              </p>
            </div>
            
            <a 
              href="https://warubi-sports.com/eliteplayer-pathways/"
              target="_blank" 
              rel="noopener noreferrer"
              className="relative z-10 shrink-0 flex items-center px-8 py-4 bg-white text-slate-950 hover:bg-emerald-50 rounded-xl font-bold text-sm transition-all transform group-hover:scale-105 shadow-xl shadow-emerald-900/20"
            >
              <span>Request Access</span>
              <ArrowRight className="w-4 h-4 ml-2" />
            </a>
        </div>
      </div>}

      {/* Beta Disclaimer */}
      <div className="no-print mt-8 pb-8 text-center">
        <p className="text-[10px] text-slate-400 dark:text-slate-600 max-w-md mx-auto leading-relaxed font-mono">
          This tool is in beta, and we are continuing to refine the user experience and data validation. If you have suggestions that could make it better, your feedback is welcome via <a href="mailto:support@warubi-sports.com?subject=ExposureEngine%20-%20Feedback" className="text-emerald-500 hover:underline">support@warubi-sports.com</a>.
        </p>
      </div>

    </div>
  );
};

export default AnalysisResultView;
