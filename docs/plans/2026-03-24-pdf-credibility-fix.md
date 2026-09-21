# PDF Credibility Fix - Self-Assessment Framing + AUSA CTA

## Problem
The PDF report looks like an official scouting evaluation but is based entirely on self-reported data. Players could misrepresent it to coaches. Warubi brand is at risk.

## Solution
Reframe the PDF as a self-assessment tool with clear verification status and an AUSA lead gen CTA.

## Changes

### 1. Report Title
- Current: "ExposureEngine Visibility Report" (or similar)
- New: "Player Self-Assessment Report"
- Subtitle: "Based on self-reported data"

### 2. Verification Badges
Add "Self-Reported" / "Verified" labels next to each section:
- Video availability: Verified (binary fact)
- Coach outreach/offers: Verified (binary fact)
- Athletic ratings: Self-Reported
- Competition level/stats: Self-Reported
- GPA: Self-Reported

### 3. Verification Gap - Make Prominent
The existing Verification Gap section is the right mechanic. Make it more visible in the PDF - it's the honest differentiator between "what you claim" and "what coaches can verify."

### 4. CTA Section (bottom of PDF)
"Want a verified evaluation? Athletes USA's recruiting team provides professional assessments based on video analysis, coach feedback, and competitive data."
- Link to athletesusa.org or app.warubi-sports.com contact
- This turns every PDF into a lead gen tool

### 5. Recalibrate International Demo
The "Luka Modric" demo profile is overpowered (3 offers, all Elite ratings). Recalibrate:
- 0-1 offers instead of 3
- 10 coaches contacted instead of 50
- Mix of Above Average / Top 10% instead of mostly Elite
- Shows more realistic, differentiated scores

## Files to Change
- `components/AnalysisResult.tsx` - PDF generation section, title, badges, CTA
- `PlayerInputForm.tsx` - Demo profile data (International / Semi-Pro)

## What Stays
- Warubi brand stays on PDF (brand awareness is valuable)
- All scoring logic unchanged
- Dashboard UI unchanged (only PDF output changes)
