import ICAL from 'ical.js';
import { Assignment, TaskType } from './types';

/** Keywords that indicate an evaluation (test/quiz/exam/midterm) */
const EVALUATION_KEYWORDS = /\b(midterm|final\s*exam|examination|exam|quiz|test)\b/i;

function inferTaskType(summary: string, description: string): TaskType {
    const text = `${summary} ${description}`;
    if (EVALUATION_KEYWORDS.test(text)) return 'evaluation';
    return 'assignment';
}

function extractCourseCode(summary: string, location: string): { courseCode: string; courseName: string } {
    // Try to find course code pattern like "CISC 124", "MATH 121", "ASTR 101"
    const codePattern = /\b([A-Z]{3,4}\s*\d{3}[A-Z]?)\b/;

    // Check summary first
    let match = summary.match(codePattern);
    if (match) {
        return {
            courseCode: match[1].replace(/\s+/g, ' '),
            courseName: summary.replace(match[0], '').replace(/^\s*[-–—:]\s*/, '').trim(),
        };
    }

    // Check location (onQ often puts course info in LOCATION field)
    match = location.match(codePattern);
    if (match) {
        // Extract more descriptive name from location
        const parenthetical = location.match(/\(([^)]+)\)/);
        return {
            courseCode: match[1].replace(/\s+/g, ' '),
            courseName: parenthetical ? parenthetical[1] : summary,
        };
    }

    return { courseCode: 'GENERAL', courseName: summary };
}

export function parseICS(icsText: string): Assignment[] {
    const jcalData = ICAL.parse(icsText);
    const comp = new ICAL.Component(jcalData);
    const events = comp.getAllSubcomponents('vevent');

    const assignments: Assignment[] = [];

    for (const event of events) {
        const vevent = new ICAL.Event(event);

        const summary = vevent.summary || '';
        const description = vevent.description || '';
        const location = String(event.getFirstPropertyValue('location') || '');

        // Get start date
        const dtstart = vevent.startDate;
        if (!dtstart) continue;

        // Convert to JS Date, respecting timezone
        const jsDate = dtstart.toJSDate();

        const isAllDay = dtstart.isDate; // true for VALUE=DATE (all-day events)

        const { courseCode, courseName } = extractCourseCode(summary, location);
        const type = inferTaskType(summary, description);

        const uid = String(event.getFirstPropertyValue('uid') || `${summary}-${jsDate.toISOString()}`);

        assignments.push({
            id: String(uid),
            title: summary,
            courseCode,
            courseName,
            dueDate: jsDate.toISOString(),
            description,
            location: String(location),
            type,
            isAllDay,
        });
    }

    // Sort by due date (soonest first)
    assignments.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    return assignments;
}
