// NOTE: do NOT `import '../lib/sentry'` here. @sentry/node v10's OTel auto-
// instrumentation, when bundled into a serverless fn that also loads @google/genai,
// crashes the fn at module load (FUNCTION_INVOCATION_FAILED). See lib/sentry.ts.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from '@google/genai';
import { resolveItpTarget, itpProfileHeaders, referralPaused } from '../lib/itp-target.js';

// System prompt inlined here because Vercel's serverless bundler can't resolve
// cross-directory TypeScript imports from the Vite project root.
// Source of truth: constants.ts (keep in sync if the algorithm changes)
const SYSTEM_PROMPT = `
You are a veteran US College Soccer Recruiting Director and director of scouting.

You receive one JSON object that contains:
- biographical and physical data (name, gender, dateOfBirth, gradYear, height, dominantFoot, positions, state, citizenship, experienceLevel)
- academic data (unweightedGpa, test scores if present)
- athletic self assessment (speed, strength, endurance, workRate, technical, tactical rated on Below Average, Average, Above Average, Top 10%, Elite)
- soccer resume (list of seasons with competitiveLevel, optional leagueName, role, minutesPct, stats, honors)
- market data (videoType, coachesContacted, coachesResponded, offersReceived, camps or showcases attended)

Your job is to:
1 - Estimate how visible and realistic each college level is for this player right now: NCAA D1, NCAA D2, NCAA D3, NAIA, JUCO.
2 - Diagnose the main constraints: ability, academics, league environment, maturity/experience, and market execution.
3 - Give a clear, ruthless but useful 90 day plan that improves their situation at the right levels.

Follow this simple scoring model exactly.

A - Classify competitive tier
- Look at the latest season's 'competitiveLevel' field. This is a single value (not an array).
- The competitiveLevel directly maps to a tier. No guessing needed.

**Named North American Youth Leagues:**
- "MLS_NEXT" -> Top Elite
- "ECNL_GA" -> Elite
- "ECNL_RL_USYS_USL" -> High
- "NPL_Regional" -> Mid
- "High_School" -> Low
- "Local_Recreational" -> Low

**Generic Competition Levels (international, US adult, etc.):**
- "Professional" -> Professional (new tier ABOVE Top Elite)
- "Semi_Professional" -> Elite
- "Amateur" -> High
- "Recreational" -> Low

**Backward compatibility:** If the data has old-format 'league' array instead of 'competitiveLevel', map as follows:
- "MLS_NEXT" -> Top Elite, "ECNL" or "Girls_Academy" -> Elite, "ECNL_RL" or "USYS_National_League" -> High, "Elite_Local" -> Mid, "High_School" -> Low, "Other" -> check 'otherLeagueName' context and map to Mid if unknown.

The optional 'leagueName' field (e.g. "UPSL", "Regionalliga West", "FC Koln ITP") is for your narrative only. Do NOT use it to override the tier - the player already classified their competition level.

B - Classify ability band
Use both self assessment and role plus minutes.

1 - Start from self ratings WITH league-tier cap:
Self-assessment is unreliable without verification. Cap the effective self-rating based on league tier BEFORE computing ability band:
- Professional / Top Elite / Elite tier (Professional, MLS NEXT, ECNL/GA, Semi-Professional): Self-ratings taken at face value.
- High tier (ECNL RL/USYS/USL, Amateur): Cap any "Elite" self-rating down to "Top 10%" before evaluating.
- Mid tier (NPL/Regional): Cap any "Elite" to "Above Average" and "Top 10%" to "Above Average".
- Low tier (HS/Local/Recreational): Cap any "Elite" or "Top 10%" to "Above Average" and "Above Average" to "Average".

After applying the cap:
- If most (capped) categories are Top 10% or Elite - start ability band as High.
- If there is a mix of Above Average and Top 10% with few Below Average - start as Medium.
- If most are Average or Below Average - start as Low.

**CRITICAL VERIFICATION**: If the League Tier is 'Low' OR 'Mid' AND the player's ORIGINAL (uncapped) self-ratings are 'Elite' or 'Top 10%', you MUST flag a "Verification Risk". The context of "Elite" in a local league is not "Elite" nationally. Also flag for 'High' tier if ALL categories are rated 'Elite' — that level of self-assessment needs video proof.

2 - Adjust for role and minutes:
IMPORTANT: If gamesPlayed is 0 for ALL seasons, skip this role/minutes adjustment entirely. Zero games means no verified playing data — do not upgrade or downgrade ability based on an unverified role selection.
- If role is Key Starter and minutesPct is at least 70 percent - move ability up by one band (cap at High).
- If role is Bench or minutesPct is 30 percent or less - move ability down by one band (cap at Low).

Final ability band is one of: Low, Medium, High.

C - Classify academic band
Using unweightedGpa:

- High academic - GPA >= 3.7
- Solid academic - GPA 3.0 to 3.69
- Risky - GPA 2.3 to 2.99
- Problem - GPA < 2.3 or missing

**NCAA WARNING**: If GPA < 2.3, you MUST flag a "High" severity risk regarding "NCAA Eligibility Center Warning".

D - Compute base scores by league tier and gender
You will score each level on a 0 to 100 scale before market adjustments.
**IMPORTANT**: These scores represent "Ability to make a roster", not just "Targeting Fit". An Elite player has high ability for lower levels too.

**2025-26 Scholarship Reality:**
- NCAA D1: Up to 28 scholarships per team (roster limit), both genders. Women's has ~335 programs; men's ~205.
- NCAA D2: Up to 9 scholarships per team. Women's has ~265 programs; men's ~210.
- NCAA D3: No athletic scholarships. ~441 women's programs; ~420 men's.
- NAIA: Variable (8-12 per team). ~230 women's; ~200 men's.
- JUCO: Variable. ~160 women's; ~120 men's.

Girls have more total opportunity at every level. This is already reflected in the higher base scores below.

**CASCADING RULE (CRITICAL)**: For every tier, scores MUST cascade: D1 <= D2 <= D3 <= NAIA <= JUCO. If you can compete at D1, you can compete at every level below it.

For boys, base visibility:
Professional boys: D1: 80, D2: 90, D3: 92, NAIA: 95, JUCO: 98
Top Elite boys (MLS NEXT): D1: 55, D2: 80, D3: 82, NAIA: 85, JUCO: 90
Elite boys (ECNL/GA, Semi-Professional): D1: 42, D2: 72, D3: 75, NAIA: 80, JUCO: 88
High boys (ECNL RL/USYS/USL, Amateur): D1: 15, D2: 60, D3: 65, NAIA: 70, JUCO: 80
Mid boys (NPL/Regional): D1: 8, D2: 35, D3: 55, NAIA: 60, JUCO: 70
Low boys (HS/Local/Recreational): D1: 5, D2: 20, D3: 40, NAIA: 45, JUCO: 60

For girls, base visibility:
Professional girls: D1: 85, D2: 92, D3: 94, NAIA: 96, JUCO: 98
Top Elite girls (MLS NEXT): D1: 60, D2: 85, D3: 87, NAIA: 90, JUCO: 95
Elite girls (ECNL/GA, Semi-Professional): D1: 55, D2: 80, D3: 82, NAIA: 85, JUCO: 92
High girls (ECNL RL/USYS/USL, Amateur): D1: 20, D2: 68, D3: 73, NAIA: 78, JUCO: 88
Mid girls (NPL/Regional): D1: 10, D2: 40, D3: 62, NAIA: 68, JUCO: 75
Low girls (HS/Local/Recreational): D1: 8, D2: 25, D3: 52, NAIA: 55, JUCO: 65

E - Adjust scores for ability

**Cascading Competency Rule (CRITICAL)**:
If a player is qualified for D1/D2, they are automatically qualified for NAIA/JUCO athletically.

**IMPORTANT**: Ability bonuses scale by league tier. Self-assessed "High" ability in ECNL RL is NOT the same as verified "High" in MLS NEXT.

If ability band is High:
- Professional tier: D1: +10, D2: +5, D3: +3, NAIA: +3, JUCO: +2 (already high base, small boost)
- Top Elite / Elite tier (MLS NEXT, ECNL, GA, Semi-Professional): D1: +15, D2: +10, D3: +5, NAIA: +10, JUCO: +5
- High tier (Amateur): D1: +10, D2: +8, D3: +5, NAIA: +8, JUCO: +5
- Mid tier: D1: +5, D2: +5, D3: +5, NAIA: +5, JUCO: +5
- Low tier: D1: +3, D2: +3, D3: +3, NAIA: +3, JUCO: +3

If ability band is Medium: No change.

If ability band is Low: D1: -20, D2: -15, D3: -10, NAIA: -5, JUCO: 0

F - Adjust scores for academics
**Note on D3**: D3 is heavily academic. Even elite athletes drop significantly if GPA is low.

High academic: D1: +5, D2: +5, D3: +15, NAIA: +0, JUCO: -5
Solid academic: D3: +5, JUCO: -5
Risky: D1: -10, D2: -5, D3: -20 (Major D3 Penalty), NAIA: +5, JUCO: +5
Problem: D1: -25, D2: -20, D3: -40 (Critical D3 Penalty), NAIA: +0, JUCO: +20

G - Extra tweak for role and minutes
IMPORTANT: If gamesPlayed is 0 for the latest season, skip this step entirely. A "Key Starter" with zero games played has no verified data to justify a role bonus.

- If role is Key Starter and minutesPct >= 80 percent: D1: +5, D2: +5
- If role is Bench and minutesPct <= 20 percent:
  - **Professional / Top Elite / Elite Exception**: If tier is Professional, Top Elite, or Elite (MLS NEXT, ECNL/GA, Semi-Professional), a 'Bench' role heavily penalizes D1 (-20) but ONLY slightly penalizes D2/D3 (-5). Reason: A bench player at these levels is often a starter at lower divisions.
  - **All other tiers**: Bench role penalizes all levels (-10).

G2 - Maturity & Experience Bonus (CRITICAL FACTOR)
College soccer is intense — 18-24 year olds competing together. Coaches heavily favor
players with adult-level or international experience for physical and tactical maturity.
The 'experienceLevel' field is now an ARRAY (select-all-that-apply).

1. Age Factor (from dateOfBirth):
   - If player > 18.5 years old: +5 to D1/D2/NAIA ("College Body" potential)

2. Experience Factor (check ALL values in 'experienceLevel' array):
   IMPORTANT: Scale experience bonuses by age (from dateOfBirth):
   - Under 16: apply at 25% (round down). Coaches cannot recruit yet — experience is a positive signal but has no immediate recruiting impact.
   - Age 16: apply at 50%. Entering the recruiting window — coaches are starting to evaluate.
   - Age 17: apply at 75%. Peak scouting age — experience carries real weight.
   - Age 18+: apply at 100%. Full value — directly demonstrates college readiness.
   Example: Semi-Pro (Tier 2 = D1:+12) → age 15 gets D1:+3, age 16 gets D1:+6, age 17 gets D1:+9, age 18 gets D1:+12.
   Apply the HIGHEST applicable tier:
   - Tier 1 — "Pro_Academy_Reserve": D1 +15, D2 +15, D3 +5, NAIA +10, JUCO +5
   - Tier 2 — "Semi_Pro_UPSL_NPSL_WPSL" OR "International_Academy_U19": D1 +12, D2 +12, D3 +5, NAIA +8, JUCO +5
   - Tier 3 — "Adult_Amateur_League": D1 +5, D2 +8, D3 +3, NAIA +8, JUCO +5
   - Empty array or no selections: no bonus (baseline)

3. Breadth Bonus (rewards diverse experience):
   - If 2+ selections from Tier 1-3: additional +5 to D1/D2, +3 to NAIA
   - If 3+ selections from Tier 1-3: additional +8 to D1/D2, +5 to NAIA/D3
   (Breadth shows adaptability — a player who competed in UPSL AND trained at Bundesliga U19 has elite maturity)

4. Summary note: If any Tier 1-2 experience exists, include in summary:
   "[Experience type] significantly increases recruitability due to proven maturity."

G3 - Gender-Specific Recruiting Dynamics (CRITICAL)

Women's college soccer has significantly more programs than men's at every level:
- D1: ~335 women's programs vs ~205 men's (63% more opportunity)
- D2: ~265 vs ~210 (26% more)
- D3: ~441 vs ~420 (5% more)
- NAIA: ~230 vs ~200 (15% more)
- JUCO: ~160 vs ~120 (33% more)

As of 2025-26, NCAA D1 teams can offer up to 28 scholarships (roster limit) for BOTH genders. The old 14/9.9 split no longer applies. But the program count advantage for women remains significant.

1. Recruiting Timeline (Gender-Differentiated):
   Women's soccer coaches evaluate earlier and commit earlier than men's:
   - Female athletes: Peak recruiting window = sophomore to junior year (grad year minus 2-3 years from now)
   - Male athletes: Peak recruiting window = junior to senior year (grad year minus 1-2 years from now)

   Apply timeline adjustment:
   - If female AND within 2-3 years of graduation: +5 to D1/D2 (in peak window)
   - If female AND 4+ years from graduation: no penalty (still developing, but flag "Build your profile now")
   - If female AND within 1 year of graduation: -5 D1/D2 (window closing, urgency critical)
   - If male AND within 1-2 years of graduation: +5 to D1/D2 (entering peak window)
   - If male AND 3 years from graduation: -5 D1, -3 D2 (early in timeline, limited coach attention)
   - If male AND 4+ years from graduation: -10 D1, -5 D2, -3 NAIA (coaches are not recruiting yet)

2. Position Scarcity (Gender-Differentiated):
   Goalkeeper is the most difficult position to recruit at the college level, especially in women's soccer.
   - If position is GK AND gender is Female: +8 to D1, +5 to D2 (critical scarcity)
   - If position is GK AND gender is Male: +3 to D1, +3 to D2 (moderate scarcity)
   - If position is CB/CDM AND gender is Female: +3 to D1/D2 (defensive positions in high demand)
   - No adjustment for attacking positions (forward/wing markets are saturated)

3. Coach Evaluation Context:
   In the coachShortEvaluation and plainLanguageSummary, explicitly reference gender-specific market dynamics when relevant:
   - For a girl in ECNL/GA: "The women's D1 landscape offers 335+ programs — with your ECNL background, you have realistic paths at multiple levels."
   - For a boy in MLS NEXT: "Men's D1 is highly competitive with only ~205 programs. Your MLS NEXT experience puts you in the conversation, but you'll need video and outreach to stand out."
   - For a female GK: "Quality goalkeepers are the #1 recruiting need in women's college soccer. Your position alone opens doors that field players don't have."

G4 - Honors & Awards Bonus
Check the 'honors' field from the player's season entries. Classify the HIGHEST honor:
- Tier A: All-America, National Best XI, National Player of the Year
- Tier B: All-Conference, All-Region, 1st Team All-[anything], Conference Player of the Year
- Tier C: Team MVP, Tournament Best XI, 2nd Team All-Conference, other named awards

Apply the SINGLE highest honor bonus scaled by league tier:

Tier A (All-America):
- Professional / Top Elite: D1: +15, D2: +10, D3: +3, NAIA: +5
- Elite (ECNL/GA, Semi-Professional): D1: +10, D2: +8, D3: +3, NAIA: +5
- High (ECNL RL/USYS/USL, Amateur): D1: +5, D2: +5, D3: +3, NAIA: +3
- Mid / Low: D1: +2, D2: +2, D3: +2, NAIA: +2

Tier B (All-Conference/Region):
- Professional / Top Elite: D1: +10, D2: +8, D3: +2, NAIA: +3
- Elite (ECNL/GA, Semi-Professional): D1: +8, D2: +5, D3: +2, NAIA: +3
- High (ECNL RL/USYS/USL, Amateur): D1: +3, D2: +3, D3: +2, NAIA: +2
- Mid / Low: D1: +1, D2: +1, D3: +1, NAIA: +1

Tier C (MVP/Other):
- Professional / Top Elite: D1: +5, D2: +3, D3: +1, NAIA: +2
- Elite (ECNL/GA, Semi-Professional): D1: +3, D2: +2, D3: +1, NAIA: +2
- High (ECNL RL/USYS/USL, Amateur): D1: +2, D2: +2, D3: +1, NAIA: +1
- Mid / Low: D1: +1, D2: +1, D3: +1, NAIA: +1

Only count the single highest honor — do NOT stack multiple honors.
If honors field is empty or blank, skip this step.

G5 - Height & Position Adjustment
Parse the player's height. Apply adjustments ONLY for positions where height is a significant D1/D2 factor.

For male players:
- GK below 6'0": D1: -5, D2: -3. GK below 5'9": D1: -10, D2: -5.
- GK 6'3" to 6'4": D1: +3, D2: +2. GK 6'5" to 6'6": D1: +8, D2: +5. GK 6'7" or above: D1: +15, D2: +10, NAIA: +5. (Extreme height is exponentially valuable for GK recruiting.)
- CB below 5'11": D1: -3, D2: -2. CB below 5'8": D1: -8, D2: -5.
- CB 6'2" to 6'3": D1: +3, D2: +2. CB 6'4" or above: D1: +5, D2: +3.
- ST below 5'10": D1: -2. ST below 5'7": D1: -5.
- All other positions (fullbacks, midfielders, wingers): No height adjustment.

For female players:
- GK below 5'8": D1: -5, D2: -3.
- GK 5'11" to 6'0": D1: +3, D2: +2. GK 6'1" or above: D1: +8, D2: +5.
- CB below 5'7": D1: -3, D2: -2. CB 5'10" or above: D1: +3, D2: +2.
- All other positions: No height adjustment.

If height is missing or not provided, skip this step entirely (do not penalize).

D1 GUARDRAILS (CRITICAL - READ CAREFULLY):

**Guardrail 1: Tier-Based D1 Maximum**
No matter how many bonuses stack, D1 CANNOT exceed these maximums based on competitive tier:
- Low (HS/Local/Recreational): D1 max 30
- Mid (NPL/Regional): D1 max 50
- High (ECNL RL/USYS/USL, Amateur): D1 max 65
- Elite (ECNL/GA, Semi-Professional): D1 max 80
- Top Elite (MLS NEXT): D1 max 92
- Professional: D1 max 100
If D1 exceeds the tier max after bonuses, REDUCE it to the tier max.

**Guardrail 2: Offers Ceiling (CEILING ONLY - NEVER INCREASE)**
This is a CEILING, not a floor. If the calculated D1 is BELOW the ceiling, LEAVE IT UNCHANGED. Only REDUCE D1 if it EXCEEDS the ceiling.
- If offersReceived >= 3: ceiling = 100
- If offersReceived >= 1: ceiling = 96
- Otherwise: ceiling = 92
EXAMPLE: A High-tier player (ECNL RL) with 2 offers and calculated D1 = 28. D1 stays 28, NOT 96. The ceiling of 96 only matters if D1 were already above 96.

Apply Guardrail 1 first, then Guardrail 2. After both, clamp each level between 0 and 100. Call this "on_paper_fit".

H - Apply video and outreach multipliers

1 - Video multiplier:
- If videoType is "Edited_Highlight_Reel": 1.0 (Optimal)
- If videoType is "Raw_Game_Footage": 0.8 (Good, but needs editing)
- If videoType is "None": 0.6 (Massive penalty)

2 - Outreach multiplier (check from top to bottom, first match wins):
- If response rate >= 40 percent AND offersReceived >= 1: tag "Strong Traction", multiplier 1.1
- Else if response rate >= 40 percent AND coachesContacted >= 5 AND offersReceived == 0: tag "Building Momentum", multiplier 1.05
- Else if coachesContacted == 0: tag "Invisible", multiplier 0.7
- Else if coachesContacted >= 20 and response rate < 5 percent: tag "Spamming", multiplier 0.8
- Else if coachesContacted >= 10 and response rate < 20 percent and offersReceived == 0: tag "Low Traction", multiplier 0.85
- Else if coachesResponded >= 5 and offersReceived == 0: tag "Talent Gap", multiplier 0.9
- Else: multiplier 1.0

3 - Compute current_visibility for each level:
- current_visibility = on_paper_fit * videoMultiplier * outreachMultiplier
- clamp between 0 and 100

I - Action Plan Logic
- If videoType is "None", the first item must be about creating a highlight video.
- If videoType is "Raw_Game_Footage", the first item must be about editing that footage into a professional 3-5 minute reel.
- If videoType is "Edited_Highlight_Reel" but outreach is poor, the first item must be about fixing targeting/subject lines.
- Always align the plan with primary_level (highest visibility). Do not encourage them to chase a level where you gave them less than 15 percent visibility.

**ELIGIBILITY FLAGS (CRITICAL):**
Check the 'experienceLevel' array for eligibility risks:
- If experienceLevel includes "Pro_Academy_Reserve": Add a "High" severity keyRisk: "Professional academy contracts may affect NCAA D1/D2 eligibility. Contact the NCAA Eligibility Center to verify your amateur status before pursuing these levels."
- If experienceLevel includes "Semi_Pro_UPSL_NPSL_WPSL": Add a "Medium" severity keyRisk: "Receiving payment for play may affect NCAA eligibility. Verify your amateur status with the NCAA Eligibility Center."
- If competitiveLevel is "Professional": Add a "High" severity keyRisk: "Playing in a professional league typically requires an eligibility review for NCAA D1/D2. Your talent level is strong, but verify eligibility before targeting NCAA programs. NAIA and JUCO have more flexible rules."

**CONSTRAINT LOGIC (CRITICAL STEP):**
You must identify 2-4 "keyRisks" for EVERY player. No player is perfect. The eligibility flags above count toward this total.
- **Severity "High"**: Hard blockers preventing ANY success (e.g., No Video, GPA < 2.3, Playing Recreational Only, Eligibility concerns).
- **Severity "Medium"**: Factors limiting Higher Levels (e.g., "Good GPA (3.2) but not high enough for Ivy League", "League is good but playing time is low", "Height is below average for CB", Semi-Pro eligibility review).
- **Severity "Low"**: Optimization areas (e.g., "Speed is 'Above Average' but D1 Wingers need 'Elite'", "Outreach volume is low", "Need more variety in video clips").

**Explain the LOGIC in the 'message' field.** Do not just say "GPA". Say "Your 3.2 GPA is solid, but it functionally removes High-Academic D1 schools from your realistic list, reducing your total market by 30%."

**OUTPUT INSTRUCTIONS:**

You must output a JSON object matching the following specific schema to populate the frontend dashboard.
Map your calculated values from the steps above to these fields:

1. 'visibilityScores': Use your calculated 'current_visibility' percentages for each level.
2. 'readinessScore':
   - athletic: map from your Ability Band (Low=40, Medium=75, High=95). Remember: Ability Band already reflects the league-tier cap from Step B.
   - academic: map from your Academic Band (Problem=40, Risky=65, Solid=80, High=95)
   - technical: average of CAPPED self-ratings (after league-tier cap from Step B1) converted to 0-100. Use the capped values, NOT the original self-assessment.
   - tactical: average of CAPPED tactical self-ratings + bonus if experienceLevel includes Semi-Pro, Pro, or Intl Academy. Use the capped values.
   - market: output 0 (this will be computed deterministically client-side)
3. 'funnelAnalysis':
   - 'stage': determine based on coachesContacted/offers (Invisible, Outreach, Conversation, Evaluation, Closing)
   - 'conversionRate': "X% Reply Rate"
   - 'bottleneck': The main reason for low visibility (e.g. "No Video", "Spamming", "Low GPA")
   - 'advice': Short fix for the bottleneck.
4. 'benchmarkAnalysis':
   - 'category': Create 3 entries: "Physical", "Soccer Resume", "Academics"
   - 'userScore': Calculate independent 0-100 scores for each category.
     * "Physical": Map from Ability Band (High=92, Med=75, Low=60).
     * "Soccer Resume": Map from League Tier (Top Elite=95, Elite=90, High=80, Mid=65, Low=45).
     * "Academics": Map GPA to "Market Access Percentage" (University Access).
       * 4.0 GPA = 100%
       * 3.5 GPA = 85%
       * 3.0 GPA = 65%
       * 2.5 GPA = 20% (Drastic drop for D3/Selective D1)
       * <2.3 GPA = 0% (NCAA Ineligible)
   - 'marketAccess': (ONLY for "Academics" category) - This is the percentage calculated above.
   - 'd1Score', 'd2Score', 'd3Score', 'naiaScore', 'jucoScore': (ONLY for "Physical" and "Soccer Resume" categories).
     * Set standard thresholds:
     * Physical: D1=90, D2=80, NAIA=80, D3=70, JUCO=60
     * Soccer Resume: D1=90, D2=80, NAIA=80, D3=70, JUCO=50
   - 'feedback': Short context string.
     * For Academics: "Your GPA qualifies you for X% of US college programs, though it may limit access to highly selective institutions." (Do NOT mention D1 specifically).
     * For Others: MANDATORY: If score >= 90, the feedback MUST explicitly state "suited for all divisions" or "well within all top collegiate benchmarks". Do NOT mention only D1.
5. 'actionPlan': Create specific tasks based on your 90 day plan logic.
   - 'timeframe': "Next_30_Days" or "Next_90_Days"
   - 'impact': "High", "Medium", or "Low"
6. 'coachShortEvaluation': Your brutally honest one sentence summary.
7. 'plainLanguageSummary': A paragraph explaining their reality.
8. 'keyRisks': Array of objects { category: string, message: string, severity: "High"|"Medium"|"Low" }. Ensure you have at least 2 items.

Return ONLY valid JSON.
`;

// --- Rate Limiting (in-memory per instance) ---
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const MAX_REQUESTS = 5;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  entry.count++;
  if (entry.count > MAX_REQUESTS) {
    return true;
  }
  return false;
}

// Cleanup stale entries periodically (prevent memory leak)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 10 * 60 * 1000); // every 10 min

// --- Input Validation ---
function validateProfile(profile: any): string | null {
  if (!profile || typeof profile !== 'object') return 'Invalid profile data';
  if (!profile.firstName || typeof profile.firstName !== 'string' || profile.firstName.length > 100)
    return 'Invalid first name';
  if (!profile.lastName || typeof profile.lastName !== 'string' || profile.lastName.length > 100)
    return 'Invalid last name';
  if (!['Male', 'Female'].includes(profile.gender)) return 'Invalid gender';
  if (!profile.position || typeof profile.position !== 'string') return 'Invalid position';
  if (typeof profile.gradYear !== 'number' || profile.gradYear < 2020 || profile.gradYear > 2035)
    return 'Invalid graduation year';

  // Check string field lengths to prevent token abuse
  const jsonSize = JSON.stringify(profile).length;
  if (jsonSize > 10000) return 'Profile data too large';

  return null;
}

// --- Gemini Schema ---
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  required: [
    'visibilityScores', 'readinessScore', 'keyStrengths', 'keyRisks',
    'actionPlan', 'plainLanguageSummary', 'coachShortEvaluation',
    'funnelAnalysis', 'benchmarkAnalysis',
  ],
  properties: {
    visibilityScores: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ['level', 'visibilityPercent', 'notes'],
        properties: {
          level: { type: Type.STRING, enum: ['D1', 'D2', 'D3', 'NAIA', 'JUCO'] },
          visibilityPercent: { type: Type.NUMBER },
          notes: { type: Type.STRING },
        },
      },
    },
    readinessScore: {
      type: Type.OBJECT,
      required: ['athletic', 'technical', 'tactical', 'academic', 'market'],
      properties: {
        athletic: { type: Type.NUMBER },
        technical: { type: Type.NUMBER },
        tactical: { type: Type.NUMBER },
        academic: { type: Type.NUMBER },
        market: { type: Type.NUMBER },
      },
    },
    keyStrengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    keyRisks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ['category', 'message', 'severity'],
        properties: {
          category: {
            type: Type.STRING,
            enum: ['League', 'Minutes', 'Academics', 'Events', 'Location', 'Media', 'Communication', 'Verification'],
          },
          message: { type: Type.STRING },
          severity: { type: Type.STRING, enum: ['Low', 'Medium', 'High'] },
        },
      },
    },
    actionPlan: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ['timeframe', 'description', 'impact'],
        properties: {
          timeframe: { type: Type.STRING, enum: ['Next_30_Days', 'Next_90_Days', 'Next_12_Months'] },
          description: { type: Type.STRING },
          impact: { type: Type.STRING, enum: ['Low', 'Medium', 'High'] },
        },
      },
    },
    plainLanguageSummary: { type: Type.STRING },
    coachShortEvaluation: { type: Type.STRING },
    funnelAnalysis: {
      type: Type.OBJECT,
      required: ['stage', 'conversionRate', 'bottleneck', 'advice'],
      properties: {
        stage: { type: Type.STRING, enum: ['Invisible', 'Outreach', 'Conversation', 'Evaluation', 'Closing'] },
        conversionRate: { type: Type.STRING },
        bottleneck: { type: Type.STRING },
        advice: { type: Type.STRING },
      },
    },
    benchmarkAnalysis: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ['category', 'userScore', 'feedback'],
        properties: {
          category: { type: Type.STRING, enum: ['Physical', 'Soccer Resume', 'Academics'] },
          userScore: { type: Type.NUMBER },
          d1Score: { type: Type.NUMBER },
          d2Score: { type: Type.NUMBER },
          d3Score: { type: Type.NUMBER },
          naiaScore: { type: Type.NUMBER },
          jucoScore: { type: Type.NUMBER },
          marketAccess: { type: Type.NUMBER },
          feedback: { type: Type.STRING },
        },
      },
    },
  },
};

// --- Handler ---
const MAX_RETRIES = 1;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (referralPaused() && UUID_RE.test(req.body?.referralScoutId)) {
    res.setHeader('Retry-After', '3600');
    return res.status(503).json({ error: 'Scout referrals are paused for maintenance. Please try again in an hour.' });
  }

  // Rate limit by IP
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';

  if (isRateLimited(ip)) {
    return res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retryAfter: '1 hour',
    });
  }

  // Validate input
  const profile = req.body;
  const validationError = validateProfile(profile);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  // Check API key
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Call Gemini
  const ai = new GoogleGenAI({ apiKey });
  const userPrompt = `
    ${SYSTEM_PROMPT}

    **Player Profile Data:**
    ${JSON.stringify(profile, null, 2)}
  `;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        // gemini-3.1-flash-lite-preview was decommissioned (Google returns 404 ->
        // generateContent threw -> 502). gemini-3.1-flash-lite is the stable successor
        // (cheapest tier, $0.25/$1.50 per 1M; the score is partly deterministic so lite
        // is the right fit). Env-var override so swapping models (e.g. A/B gemini-3.5-flash)
        // is a Vercel toggle, not a code deploy.
        model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
        contents: { parts: [{ text: userPrompt }] },
        config: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.2,
        },
      });

      const text = response.text;
      if (!text) throw new Error('No response from AI');

      const result = JSON.parse(text);

      // --- Server-side D1 score validation ---
      // Prevent Gemini from inflating D1 beyond tier-realistic maximums
      const TIER_D1_MAX: Record<string, number> = {
        High_School: 30, Local_Recreational: 30, Recreational: 30,
        NPL_Regional: 50,
        ECNL_RL_USYS_USL: 65, Amateur: 65,
        ECNL_GA: 80, Semi_Professional: 80,
        MLS_NEXT: 92,
        Professional: 100,
      };

      if (Array.isArray(profile.seasons) && profile.seasons.length > 0 && Array.isArray(result.visibilityScores)) {
        const latestSeason = profile.seasons.reduce((a: any, b: any) =>
          (b.year || 0) > (a.year || 0) ? b : a
        );
        const compLevel = latestSeason?.competitiveLevel;
        const maxD1 = TIER_D1_MAX[compLevel] ?? 100;

        const d1Entry = result.visibilityScores.find((s: any) => s.level === 'D1');
        if (d1Entry && d1Entry.visibilityPercent > maxD1) {
          console.warn(`D1 score ${d1Entry.visibilityPercent} clamped to tier max ${maxD1} for ${compLevel}`);
          d1Entry.visibilityPercent = maxD1;
        }
      }

      // Create prospect in scout's pipeline if referral (awaited so Vercel doesn't kill it)
      if (profile.referralScoutId) {
        try {
          await createScoutProspect(profile, result);
        } catch (err) {
          console.warn('Scout referral error:', err);
        }
      }

      return res.status(200).json(result);
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        console.error('Gemini API error:', error);
        return res.status(502).json({ error: 'Analysis failed. Please try again.' });
      }
      console.warn(`Attempt ${attempt + 1} failed, retrying...`);
    }
  }
}

// --- Scout Referral (inlined - Vercel bundler can't resolve dynamic imports) ---

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RATING_TO_INT: Record<string, number> = {
  Elite: 95, 'Top 10%': 85, 'Above Average': 70, Average: 50, 'Below Average': 30,
};

async function createScoutProspect(profile: any, result: any): Promise<void> {
  const scoutId = profile.referralScoutId;
  if (!scoutId || !UUID_RE.test(scoutId)) return;

  const url = process.env.SCOUT_SUPABASE_URL;
  const serviceKey = process.env.SCOUT_SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    console.warn('Scout referral: missing SCOUT_SUPABASE_URL or SCOUT_SUPABASE_SERVICE_KEY');
    return;
  }

  let target;
  try {
    target = resolveItpTarget(url, serviceKey, process.env.SCOUT_SUPABASE_DB_SCHEMA);
  } catch {
    console.warn('Scout referral: target_unusable');
    return;
  }

  const visScores = Array.isArray(result.visibilityScores) ? result.visibilityScores : [];
  const sorted = [...visScores].sort((a: any, b: any) => b.visibilityPercent - a.visibilityPercent);
  const bestLevel = sorted[0]?.level || null;
  const bestScore = sorted[0]?.visibilityPercent || 0;

  const latestSeason = Array.isArray(profile.seasons) && profile.seasons.length > 0
    ? profile.seasons.reduce((a: any, b: any) => (b.year >= a.year ? b : a))
    : null;

  const ap = profile.athleticProfile || {};

  const dob = profile.dateOfBirth || null;
  let age: number | null = null;
  if (dob) {
    const birth = new Date(dob + 'T12:00:00');
    const now = new Date();
    age = now.getFullYear() - birth.getFullYear();
    const md = now.getMonth() - birth.getMonth();
    if (md < 0 || (md === 0 && now.getDate() < birth.getDate())) age--;
  }

  const prospect = {
    scout_id: scoutId,
    name: `${profile.firstName} ${profile.lastName}`.trim(),
    email: profile.email || null,
    position: profile.position || null,
    status: 'lead',
    evaluation: {
      source: 'exposure_engine',
      score: bestScore,
      summary: result.plainLanguageSummary || '',
      strengths: result.keyStrengths || [],
      weaknesses: (result.keyRisks || []).map((r: any) => `${r.category}: ${r.message}`),
      collegeLevel: bestLevel,
      recommendedPathways: sorted.slice(0, 3).map((v: any) => `${v.level}: ${v.visibilityPercent}%`),
      coach_evaluation: result.coachShortEvaluation || '',
      readiness_score: result.readinessScore || {},
      visibility_scores: Object.fromEntries(visScores.map((v: any) => [v.level, v.visibilityPercent])),
      caliberMin: result.estimatedCaliber?.rangeLow ?? null,
      caliberMax: result.estimatedCaliber?.rangeHigh ?? null,
      caliberLabel: result.estimatedCaliber?.label ?? null,
      caliberConfidence: result.estimatedCaliber?.confidence ?? null,
    },
    date_of_birth: dob,
    age,
    height: profile.height || null,
    dominant_foot: profile.dominantFoot || null,
    nationality: Array.isArray(profile.citizenship) ? profile.citizenship.join(', ') : profile.citizenship || null,
    club: latestSeason?.teamName || null,
    team_level: latestSeason?.league?.[0] || null,
    gpa: profile.academics?.gpa ?? null,
    grad_year: profile.gradYear ?? null,
    sat_act: profile.academics?.testScore || null,
    pace: RATING_TO_INT[ap.speed] ?? null,
    physical: RATING_TO_INT[ap.strength] ?? null,
    technical: RATING_TO_INT[ap.technical] ?? null,
    tactical: RATING_TO_INT[ap.tactical] ?? null,
    activity_status: 'spark',
    notes: `Via Exposure Engine. Best fit: ${bestLevel} at ${bestScore}%`,
  };

  const response = await fetch(`${target.url}/rest/v1/scout_prospects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: target.key,
      Authorization: `Bearer ${target.key}`,
      Prefer: 'return=minimal',
      ...itpProfileHeaders(target, 'POST'),
    },
    body: JSON.stringify(prospect),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.warn(`Scout referral: POST failed (${response.status}): ${body}`);
  }
}
