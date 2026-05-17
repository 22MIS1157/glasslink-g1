# Bonus: Voice Intent Classifier (Option B)

## What it does

Takes a text input (simulating what a speech-to-text engine would output from the glasses mic) and classifies it into one of five intents: capture, exit, wake, chat, or none. Works with English, Hindi, and Telugu - both in native script and romanized form.

## Why I picked this option

Honestly, Options A and C felt like they needed actual hardware or server infrastructure to demonstrate properly. Option B I could build and test entirely in the browser with no backend, and I could show measurable results (accuracy percentage) without any external dependencies. Plus, the multilingual part was interesting to figure out.

## How it works

The pipeline is straightforward:

```
Raw text --> Normalize --> Detect language --> Tokenize --> Score against dictionaries --> Pick winner
```

**Step 1 - Normalize:** Lowercase everything, strip punctuation, collapse spaces. Nothing fancy.

**Step 2 - Language detection:** I check the Unicode ranges of the characters. Devanagari (U+0900 to U+097F) means Hindi, Telugu script (U+0C00 to U+0C7F) means Telugu. If it's all ASCII, I check for known romanized Hindi/Telugu words (like "karo", "cheyyi", "teeyi") and if any match, I flag it accordingly. Otherwise default to English.

**Step 3 - Scoring:** Each intent has a dictionary of keywords/phrases with weights (0.0 to 1.0). For example, "take a photo" has weight 1.0 for the capture intent, while "camera" only has 0.6 (it could be used in other contexts). I check for:
- Exact substring matches (highest priority)
- Fuzzy matches using Levenshtein distance (for handling STT typos)
- Multi-word phrase matching using a sliding window over token bigrams

**Step 4 - Selection:** Whichever intent has the highest score above a 0.3 threshold wins. If nothing crosses 0.3, it returns "none".

## The fuzzy matching bit

I implemented Levenshtein distance (the classic DP approach) to handle cases where speech-to-text gets words slightly wrong. For example, if someone says "captuer" instead of "capture", the edit distance is 2, similarity is ~0.71, and with the weight factor it still scores high enough to classify correctly.

I'm not using any NLP library for this. The entire classifier is about 300 lines of TypeScript with zero dependencies. Thought about using something like compromise.js or even a small transformer model, but that felt like overkill for 5 intents and would add unnecessary load time.

## Language support details

| Language | How I handle it |
|----------|----------------|
| English | Direct dictionary lookup, fuzzy matching for typos |
| Hindi (Devanagari) | Separate Hindi dictionary with phrases like "photo khincho", "band karo" |
| Hindi (Romanized) | Same Hindi dictionary has romanized entries, plus language detection picks up common Hindi words |
| Telugu (Script) | Telugu dictionary with phrases like "photo teeyi" |
| Telugu (Romanized) | Same approach as Hindi romanized |

One thing I added that I think is useful: cross-language fallback. If someone types "capture karo" (mixed English-Hindi), the classifier checks the English dictionary as fallback at 80% weight. This handles code-mixed input which is super common in how we actually talk in India.

## Results

I have 21 test cases across all three languages. The classifier gets 17/21 correct, which is 85% accuracy. The failures are mostly on Telugu script inputs where the dictionary coverage is thin - I didn't have as many Telugu phrases as Hindi/English. With a bigger dictionary, this would improve.

Average processing time is under 1ms per classification. Fast enough for real-time voice command processing.

## Tradeoffs

**Dictionary-based vs ML model:** I went with dictionaries because (a) it's instant with zero latency, (b) works completely offline which matters for a wearable device, (c) it's deterministic and easy to debug. The downside is it can't handle phrasings it hasn't seen before. If someone says "I want you to snap an image of this building" it might not classify correctly because it's looking for specific keywords.

**Levenshtein vs more advanced similarity:** Levenshtein is O(n*m) per comparison which is fine for small dictionaries. For a production system with thousands of phrases, you'd want something like TF-IDF or sentence embeddings. But for 5 intents with maybe 15 phrases each, brute force Levenshtein is more than fast enough.

**0.3 confidence threshold:** This is somewhat arbitrary. Too low and you get false positives (random text classified as an intent). Too high and you miss valid commands. I picked 0.3 by testing with a few "nonsense" inputs and making sure they returned "none". Would need more data to tune this properly.

## What I'd improve

1. Hook up the Web Speech API so you can actually speak into the mic instead of typing
2. Add more Telugu and Hindi phrases - my coverage there is weaker than English
3. Implement context awareness - if the user just said "wake", the next ambiguous input is more likely "capture" than "wake" again
4. Add Kannada and Tamil support - same dictionary pattern, just need native speakers to help with the phrases
5. Maybe try a small pre-trained model (like a distilled BERT) for better generalization, but that adds 50+ MB of model weight which is a lot for a mobile app
