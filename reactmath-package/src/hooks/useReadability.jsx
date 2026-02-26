import { useMemo } from 'react';

/**
 * useReadability Hook
 * Analyzes text content for readability and style issues
 * 
 * @param {string} text - The content text to analyze
 * @returns {object} - Analysis results (score, grade, issues)
 */
const useReadability = (text) => {
    return useMemo(() => {
        if (!text) return { score: 0, grade: 0, issues: [] };

        // Basic metrics
        const sentences = text.split(/[.!?]+/).filter(Boolean) || [];
        const sentenceCount = Math.max(1, sentences.length);
        const words = text.split(/\s+/).filter(Boolean) || [];
        const wordCount = Math.max(1, words.length);

        // Syllable approximation
        let syllableCount = 0;
        words.forEach(word => {
            word = word.toLowerCase().replace(/[^a-z]/g, '');
            if (word.length <= 3) {
                syllableCount += 1;
                return;
            }
            word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
            word = word.replace(/^y/, '');
            const syllables = word.match(/[aeiouy]{1,2}/g);
            syllableCount += syllables ? syllables.length : 1;
        });

        // Flesch Reading Ease
        // Formula: 206.835 - 1.015(total words / total sentences) - 84.6(total syllables / total words)
        const score = 206.835 - (1.015 * (wordCount / sentenceCount)) - (84.6 * (syllableCount / wordCount));

        // Flesch-Kincaid Grade Level
        // Formula: 0.39(total words / total sentences) + 11.8(total syllables / total words) - 15.59
        const grade = (0.39 * (wordCount / sentenceCount)) + (11.8 * (syllableCount / wordCount)) - 15.59;

        // Passive Voice Detection (Basic heuristics)
        const passivePatterns = [
            /\b(am|are|is|was|were|be|been|being)\s+\w+ed\b/gi,
            /\b(has|have|had)\s+been\s+\w+ed\b/gi
        ];

        let passiveCount = 0;
        const passiveMatches = [];
        sentences.forEach(sentence => {
            passivePatterns.forEach(pattern => {
                const matches = sentence.match(pattern);
                if (matches) {
                    passiveCount += matches.length;
                    passiveMatches.push(matches[0]);
                }
            });
        });

        // Issues List
        const issues = [];

        // Interpret Score
        if (score < 30) {
            issues.push({ type: 'critical', message: 'Content is very difficult to read. Try simpler words and shorter sentences.' });
        } else if (score < 50) {
            issues.push({ type: 'warning', message: 'Content is somewhat difficult. Aim for a score of 60+.' });
        }

        // Paragraph Length (simulated by sentence blocks for now, or just long sentences)
        const longSentences = sentences.filter(s => s.split(' ').length > 25);
        if (longSentences.length > 0) {
            issues.push({ type: 'warning', message: `${longSentences.length} sentences contain more than 25 words. Shorten them.` });
        }

        // Passive Voice limit (e.g., > 10% of sentences)
        if (passiveCount > sentenceCount * 0.1) {
            issues.push({ type: 'warning', message: `Passive voice used ${passiveCount} times. Try active voice.` });
        }

        return {
            score: Math.min(100, Math.max(0, Math.round(score))),
            grade: Math.max(0, Math.round(grade * 10) / 10),
            readabilityLabel: getLabel(score),
            wordCount,
            sentenceCount,
            syllableCount,
            passiveCount,
            longSentences: longSentences.length,
            issues
        };
    }, [text]);
};

const getLabel = (score) => {
    if (score >= 90) return 'Very Easy';
    if (score >= 80) return 'Easy';
    if (score >= 70) return 'Fairly Easy';
    if (score >= 60) return 'Standard';
    if (score >= 50) return 'Fairly Difficult';
    if (score >= 30) return 'Difficult';
    return 'Very Difficult';
};

export default useReadability;
