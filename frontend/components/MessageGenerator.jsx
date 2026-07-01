import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, FileWarning, Linkedin, Loader2, MessageCircle, RefreshCw, Send } from "lucide-react";
import { api } from "../services/api";
import { useEventStore } from "../store/event";
import { useTranslation } from "../lib/i18n/context";

const CHANNELS = {
  linkedin: {
    icon: Linkedin,
    uiKey: "linkedin",
  },
  whatsapp: {
    icon: MessageCircle,
    uiKey: "whatsapp",
  },
};

const MESSAGE_UI = {
  en: {
    eyebrow: "SOCIAL DISTRIBUTION",
    title: "Generate LinkedIn and WhatsApp copy",
    subtitle:
      "Reusable posts and short messages built from the selected mission package. This uses local templates, so it does not spend Gemini or Google API tokens.",
    mission: "Mission",
    linkedin: "LinkedIn",
    whatsapp: "WhatsApp",
    refresh: "Refresh variants",
    noTokens: "NO AI TOKENS USED",
    noMission: "Launch a mission first, then generate posts and messages from its campaign package.",
    packageFallback: "Could not load the full package yet. Drafts are using the mission brief as a fallback.",
  },
  hi: {
    eyebrow: "सोशल वितरण",
    title: "LinkedIn और WhatsApp संदेश बनाएं",
    subtitle:
      "चुने हुए मिशन पैकेज से दोबारा इस्तेमाल होने वाली पोस्ट और छोटे संदेश बनाएं। यह स्थानीय टेम्पलेट इस्तेमाल करता है, इसलिए Gemini या Google API टोकन खर्च नहीं होते।",
    mission: "मिशन",
    linkedin: "LinkedIn",
    whatsapp: "WhatsApp",
    refresh: "नए संस्करण",
    noTokens: "AI टोकन उपयोग नहीं",
    noMission: "पहले एक मिशन लॉन्च करें, फिर उसके अभियान पैकेज से पोस्ट और संदेश बनाएं।",
    packageFallback: "पूरा पैकेज अभी लोड नहीं हुआ। ड्राफ्ट मिशन ब्रीफ से बनाए जा रहे हैं।",
  },
  kn: {
    eyebrow: "ಸೋಶಿಯಲ್ ವಿತರಣೆ",
    title: "LinkedIn ಮತ್ತು WhatsApp ಸಂದೇಶಗಳನ್ನು ರಚಿಸಿ",
    subtitle:
      "ಆಯ್ದ ಮಿಷನ್ ಪ್ಯಾಕೇಜ್‌ನಿಂದ ಮರುಬಳಕೆ ಮಾಡಬಹುದಾದ ಪೋಸ್ಟ್‌ಗಳು ಮತ್ತು ಚಿಕ್ಕ ಸಂದೇಶಗಳು. ಇದು ಸ್ಥಳೀಯ ಟೆಂಪ್ಲೇಟ್‌ಗಳನ್ನು ಬಳಸುತ್ತದೆ, ಆದ್ದರಿಂದ Gemini ಅಥವಾ Google API ಟೋಕನ್‌ಗಳು ಖರ್ಚಾಗುವುದಿಲ್ಲ.",
    mission: "ಮಿಷನ್",
    linkedin: "LinkedIn",
    whatsapp: "WhatsApp",
    refresh: "ಹೊಸ ರೂಪಾಂತರಗಳು",
    noTokens: "AI ಟೋಕನ್ ಬಳಸಿಲ್ಲ",
    noMission: "ಮೊದಲು ಮಿಷನ್ ಲಾಂಚ್ ಮಾಡಿ, ನಂತರ ಅದರ ಅಭಿಯಾನ ಪ್ಯಾಕೇಜ್‌ನಿಂದ ಪೋಸ್ಟ್‌ಗಳು ಮತ್ತು ಸಂದೇಶಗಳನ್ನು ರಚಿಸಿ.",
    packageFallback: "ಪೂರ್ಣ ಪ್ಯಾಕೇಜ್ ಇನ್ನೂ ಲೋಡ್ ಆಗಿಲ್ಲ. ಡ್ರಾಫ್ಟ್‌ಗಳು ಮಿಷನ್ ಬ್ರೀಫ್‌ನಿಂದ ರಚಿಸಲ್ಪಡುತ್ತಿವೆ.",
  },
  te: {
    eyebrow: "సోషల్ పంపిణీ",
    title: "LinkedIn మరియు WhatsApp సందేశాలు రూపొందించండి",
    subtitle:
      "ఎంచుకున్న మిషన్ ప్యాకేజీ నుంచి మళ్లీ ఉపయోగించగల పోస్టులు మరియు చిన్న సందేశాలు. ఇవి స్థానిక టెంప్లేట్‌లతో తయారవుతాయి, కాబట్టి Gemini లేదా Google API టోకెన్లు ఖర్చు కావు.",
    mission: "మిషన్",
    linkedin: "LinkedIn",
    whatsapp: "WhatsApp",
    refresh: "కొత్త వేరియంట్లు",
    noTokens: "AI టోకెన్లు ఉపయోగించలేదు",
    noMission: "ముందుగా ఒక మిషన్ ప్రారంభించండి, తర్వాత దాని క్యాంపెయిన్ ప్యాకేజీ నుంచి పోస్టులు మరియు సందేశాలు రూపొందించండి.",
    packageFallback: "పూర్తి ప్యాకేజీ ఇంకా లోడ్ కాలేదు. డ్రాఫ్ట్‌లు మిషన్ బ్రీఫ్ ఆధారంగా తయారవుతున్నాయి.",
  },
  ta: {
    eyebrow: "சமூக விநியோகம்",
    title: "LinkedIn மற்றும் WhatsApp செய்திகளை உருவாக்கவும்",
    subtitle:
      "தேர்ந்தெடுத்த மிஷன் தொகுப்பிலிருந்து மீண்டும் பயன்படுத்தக்கூடிய பதிவுகள் மற்றும் குறுஞ்செய்திகள். இது உள்ளூர் டெம்ப்ளேட்களை பயன்படுத்துகிறது; Gemini அல்லது Google API டோக்கன்கள் செலவாகாது.",
    mission: "மிஷன்",
    linkedin: "LinkedIn",
    whatsapp: "WhatsApp",
    refresh: "புதிய பதிப்புகள்",
    noTokens: "AI டோக்கன் பயன்படுத்தவில்லை",
    noMission: "முதலில் ஒரு மிஷனைத் தொடங்கவும்; பிறகு அதன் பிரச்சார தொகுப்பிலிருந்து பதிவுகள் மற்றும் செய்திகளை உருவாக்கவும்.",
    packageFallback: "முழு தொகுப்பு இன்னும் ஏற்றப்படவில்லை. டிராஃப்ட்கள் மிஷன் சுருக்கத்தை அடிப்படையாகக் கொண்டவை.",
  },
  ml: {
    eyebrow: "സോഷ്യൽ വിതരണം",
    title: "LinkedIn, WhatsApp സന്ദേശങ്ങൾ സൃഷ്ടിക്കുക",
    subtitle:
      "തിരഞ്ഞെടുത്ത മിഷൻ പാക്കേജിൽ നിന്ന് വീണ്ടും ഉപയോഗിക്കാവുന്ന പോസ്റ്റുകളും ചെറു സന്ദേശങ്ങളും. ഇത് ലോക്കൽ ടെംപ്ലേറ്റുകൾ ഉപയോഗിക്കുന്നു, അതിനാൽ Gemini അല്ലെങ്കിൽ Google API ടോക്കണുകൾ ചെലവാകില്ല.",
    mission: "മിഷൻ",
    linkedin: "LinkedIn",
    whatsapp: "WhatsApp",
    refresh: "പുതിയ വകഭേദങ്ങൾ",
    noTokens: "AI ടോക്കൺ ഉപയോഗിച്ചിട്ടില്ല",
    noMission: "ആദ്യം ഒരു മിഷൻ ലോഞ്ച് ചെയ്യുക, തുടർന്ന് അതിന്റെ ക്യാമ്പെയ്ൻ പാക്കേജിൽ നിന്ന് പോസ്റ്റുകളും സന്ദേശങ്ങളും സൃഷ്ടിക്കുക.",
    packageFallback: "പൂർണ്ണ പാക്കേജ് ഇപ്പോഴും ലോഡ് ചെയ്തിട്ടില്ല. ഡ്രാഫ്റ്റുകൾ മിഷൻ ബ്രീഫിനെ അടിസ്ഥാനമാക്കിയാണ്.",
  },
  ur: {
    eyebrow: "سوشل تقسیم",
    title: "LinkedIn اور WhatsApp پیغامات بنائیں",
    subtitle:
      "منتخب مشن پیکیج سے دوبارہ استعمال ہونے والی پوسٹس اور مختصر پیغامات بنائیں۔ یہ مقامی ٹیمپلیٹس استعمال کرتا ہے، اس لیے Gemini یا Google API ٹوکن خرچ نہیں ہوتے۔",
    mission: "مشن",
    linkedin: "LinkedIn",
    whatsapp: "WhatsApp",
    refresh: "نئے ورژن",
    noTokens: "AI ٹوکن استعمال نہیں ہوئے",
    noMission: "پہلے ایک مشن لانچ کریں، پھر اس کے مہم پیکیج سے پوسٹس اور پیغامات بنائیں۔",
    packageFallback: "مکمل پیکیج ابھی لوڈ نہیں ہوا۔ ڈرافٹس مشن بریف کی بنیاد پر بن رہے ہیں۔",
  },
};

const COPY_LOCALE = {
  en: {
    linkedinKind: "LinkedIn post",
    whatsappKind: "WhatsApp message",
    launchTitle: "Launch Announcement",
    sponsorTitle: "Sponsor Outreach",
    finalTitle: "Final Call",
    participantTitle: "Participant Invite",
    partnerTitle: "Sponsor / Partner Note",
    reminderTitle: "Reminder",
    defaultAudience: "builders, students, mentors, sponsors, and community partners",
    defaultTracks: ["Problem framing", "Prototype building", "Impact planning"],
    defaultBenefits: ["clear challenge tracks", "mentor support and demo-day visibility"],
    applyNow: "Apply now",
    sponsorBrief: "Reply for the sponsor brief",
    urgencies: ["Applications are open", "Now inviting teams", "Ready to build?"],
    tagline: (theme) => `Build practical solutions for ${theme}.`,
    launch: ({ urgency, brand, tagline, duration, audience, theme, benefits, cta, hashtags }) => [
      `${urgency} for ${brand}.`,
      "",
      tagline,
      "",
      `This ${duration}-day hackathon brings ${audience} together to turn ${theme} into demo-ready prototypes.`,
      "",
      "Teams will get:",
      `- ${benefits[0]}`,
      `- ${benefits[1]}`,
      "- a practical demo path with judging criteria and sponsor visibility",
      "",
      `${cta}: add your registration link here.`,
      "",
      hashtags,
    ],
    sponsor: ({ brand, theme, tracks, sponsorCta, hashtags }) => [
      `We are inviting sponsors and ecosystem partners for ${brand}.`,
      "",
      `The event focuses on ${theme}, with teams working across ${tracks.slice(0, 3).join(", ")}.`,
      "",
      "Sponsor value:",
      "- branded challenge visibility",
      "- mentor and workshop touchpoints",
      "- access to builders and demo-day prototypes",
      "",
      `${sponsorCta}.`,
      "",
      hashtags,
    ],
    final: ({ brand, theme, duration, cta, hashtags }) => [
      `Final call for ${brand}.`,
      "",
      `If you want to build practical solutions for ${theme}, this is the room to be in.`,
      "",
      `Bring a problem, a skill, or just the curiosity to build. ${duration} days. Clear tracks. Mentor support. Demo-day momentum.`,
      "",
      `${cta}: add your application link here.`,
      "",
      hashtags,
    ],
    participant: ({ brand, tagline, duration, audience, cta }) => [
      `Hey! We are launching ${brand}.`,
      "",
      tagline,
      "",
      `It is a ${duration}-day hackathon for ${audience}. You can join with a team or come solo and form one at kickoff.`,
      "",
      `${cta}: add link here`,
    ],
    partner: ({ brand, theme }) => [
      `Hi, we are looking for partners for ${brand}.`,
      "",
      `The hackathon is focused on ${theme}. Sponsors can support challenge tracks, mentor teams, and get demo-day visibility.`,
      "",
      "Can I send you the sponsor brief?",
    ],
    reminder: ({ brand, theme }) => [
      `Quick reminder: applications for ${brand} are open.`,
      "",
      `If you are interested in ${theme}, this is a good chance to build a real prototype with mentors and a clear demo format.`,
      "",
      "Apply here: add link here",
    ],
  },
  hi: {
    linkedinKind: "LinkedIn पोस्ट",
    whatsappKind: "WhatsApp संदेश",
    launchTitle: "लॉन्च घोषणा",
    sponsorTitle: "प्रायोजक संपर्क",
    finalTitle: "अंतिम आह्वान",
    participantTitle: "प्रतिभागी आमंत्रण",
    partnerTitle: "प्रायोजक / पार्टनर नोट",
    reminderTitle: "रिमाइंडर",
    defaultAudience: "निर्माता, छात्र, मेंटर, प्रायोजक और कम्युनिटी पार्टनर",
    defaultTracks: ["समस्या निर्धारण", "प्रोटोटाइप निर्माण", "प्रभाव योजना"],
    defaultBenefits: ["स्पष्ट चुनौती ट्रैक", "मेंटोरशिप और डेमो-डे दृश्यता"],
    applyNow: "अभी आवेदन करें",
    sponsorBrief: "प्रायोजक ब्रीफ के लिए जवाब दें",
    urgencies: ["आवेदन खुले हैं", "अब टीमों को आमंत्रित किया जा रहा है", "बनाने के लिए तैयार हैं?"],
    tagline: (theme) => `${theme} के लिए व्यावहारिक समाधान बनाएं।`,
    launch: ({ urgency, brand, tagline, duration, audience, theme, benefits, cta, hashtags }) => [
      `${brand} के लिए ${urgency}।`,
      "",
      tagline,
      "",
      `यह ${duration}-दिवसीय हैकाथॉन ${audience} को साथ लाकर ${theme} को डेमो-तैयार प्रोटोटाइप में बदलता है।`,
      "",
      "टीमों को मिलेगा:",
      `- ${benefits[0]}`,
      `- ${benefits[1]}`,
      "- निर्णायक मानदंड और प्रायोजक दृश्यता के साथ व्यावहारिक डेमो मार्ग",
      "",
      `${cta}: अपना पंजीकरण लिंक यहां जोड़ें।`,
      "",
      hashtags,
    ],
    sponsor: ({ brand, theme, tracks, sponsorCta, hashtags }) => [
      `हम ${brand} के लिए प्रायोजकों और इकोसिस्टम पार्टनर्स को आमंत्रित कर रहे हैं।`,
      "",
      `यह इवेंट ${theme} पर केंद्रित है, जहां टीमें ${tracks.slice(0, 3).join(", ")} पर काम करेंगी।`,
      "",
      "प्रायोजक मूल्य:",
      "- ब्रांडेड चैलेंज दृश्यता",
      "- मेंटर और वर्कशॉप टचपॉइंट",
      "- बिल्डर्स और डेमो-डे प्रोटोटाइप तक पहुंच",
      "",
      `${sponsorCta}।`,
      "",
      hashtags,
    ],
    final: ({ brand, theme, duration, cta, hashtags }) => [
      `${brand} के लिए अंतिम आह्वान।`,
      "",
      `अगर आप ${theme} के लिए व्यावहारिक समाधान बनाना चाहते हैं, तो यह सही जगह है।`,
      "",
      `समस्या, कौशल या सिर्फ बनाने की जिज्ञासा लेकर आएं। ${duration} दिन। स्पष्ट ट्रैक। मेंटर सपोर्ट। डेमो-डे गति।`,
      "",
      `${cta}: अपना आवेदन लिंक यहां जोड़ें।`,
      "",
      hashtags,
    ],
    participant: ({ brand, tagline, duration, audience, cta }) => [
      `नमस्ते! हम ${brand} लॉन्च कर रहे हैं।`,
      "",
      tagline,
      "",
      `यह ${audience} के लिए ${duration}-दिवसीय हैकाथॉन है। आप टीम के साथ जुड़ सकते हैं या अकेले आकर किकऑफ पर टीम बना सकते हैं।`,
      "",
      `${cta}: लिंक यहां जोड़ें`,
    ],
    partner: ({ brand, theme }) => [
      `नमस्ते, हम ${brand} के लिए पार्टनर्स खोज रहे हैं।`,
      "",
      `यह हैकाथॉन ${theme} पर केंद्रित है। प्रायोजक चैलेंज ट्रैक सपोर्ट कर सकते हैं, टीमों को मेंटर कर सकते हैं और डेमो-डे दृश्यता पा सकते हैं।`,
      "",
      "क्या मैं आपको प्रायोजक ब्रीफ भेज सकता हूं?",
    ],
    reminder: ({ brand, theme }) => [
      `त्वरित रिमाइंडर: ${brand} के लिए आवेदन खुले हैं।`,
      "",
      `अगर आपकी रुचि ${theme} में है, तो मेंटर्स और स्पष्ट डेमो फॉर्मेट के साथ वास्तविक प्रोटोटाइप बनाने का यह अच्छा मौका है।`,
      "",
      "आवेदन करें: लिंक यहां जोड़ें",
    ],
  },
  kn: {
    linkedinKind: "LinkedIn ಪೋಸ್ಟ್",
    whatsappKind: "WhatsApp ಸಂದೇಶ",
    launchTitle: "ಲಾಂಚ್ ಘೋಷಣೆ",
    sponsorTitle: "ಪ್ರಾಯೋಜಕ ಸಂಪರ್ಕ",
    finalTitle: "ಕೊನೆಯ ಆಹ್ವಾನ",
    participantTitle: "ಭಾಗವಹಿಸುವವರ ಆಹ್ವಾನ",
    partnerTitle: "ಪ್ರಾಯೋಜಕ / ಪಾಲುದಾರ ಟಿಪ್ಪಣಿ",
    reminderTitle: "ಜ್ಞಾಪನೆ",
    defaultAudience: "ನಿರ್ಮಾತೃಗಳು, ವಿದ್ಯಾರ್ಥಿಗಳು, ಮೆಂಟರ್‌ಗಳು, ಪ್ರಾಯೋಜಕರು ಮತ್ತು ಸಮುದಾಯ ಪಾಲುದಾರರು",
    defaultTracks: ["ಸಮಸ್ಯೆ ರೂಪಿಸುವಿಕೆ", "ಪ್ರೋಟೋಟೈಪ್ ನಿರ್ಮಾಣ", "ಪರಿಣಾಮ ಯೋಜನೆ"],
    defaultBenefits: ["ಸ್ಪಷ್ಟ ಚಾಲೆಂಜ್ ಟ್ರ್ಯಾಕ್‌ಗಳು", "ಮೆಂಟರ್ ಬೆಂಬಲ ಮತ್ತು ಡೆಮೊ-ಡೇ ಗೋಚರತೆ"],
    applyNow: "ಈಗ ಅರ್ಜಿ ಸಲ್ಲಿಸಿ",
    sponsorBrief: "ಪ್ರಾಯೋಜಕ ಬ್ರೀಫ್‌ಗಾಗಿ ಪ್ರತಿಕ್ರಿಯಿಸಿ",
    urgencies: ["ಅರ್ಜಿಗಳು ತೆರೆಯಲಾಗಿದೆ", "ಈಗ ತಂಡಗಳನ್ನು ಆಹ್ವಾನಿಸಲಾಗುತ್ತಿದೆ", "ನಿರ್ಮಿಸಲು ಸಿದ್ಧವೇ?"],
    tagline: (theme) => `${theme}ಗಾಗಿ ಪ್ರಾಯೋಗಿಕ ಪರಿಹಾರಗಳನ್ನು ನಿರ್ಮಿಸಿ.`,
    launch: ({ urgency, brand, tagline, duration, audience, theme, benefits, cta, hashtags }) => [
      `${brand}ಗಾಗಿ ${urgency}.`,
      "",
      tagline,
      "",
      `ಈ ${duration}-ದಿನಗಳ ಹ್ಯಾಕಥಾನ್ ${audience}ರನ್ನು ಒಟ್ಟುಗೂಡಿಸಿ ${theme} ಅನ್ನು ಡೆಮೊ-ಸಿದ್ಧ ಪ್ರೋಟೋಟೈಪ್‌ಗಳಾಗಿ ರೂಪಿಸುತ್ತದೆ.`,
      "",
      "ತಂಡಗಳಿಗೆ ಸಿಗುವುದು:",
      `- ${benefits[0]}`,
      `- ${benefits[1]}`,
      "- ಜಡ್ಜಿಂಗ್ ಮಾನದಂಡ ಮತ್ತು ಪ್ರಾಯೋಜಕ ಗೋಚರತೆಯೊಂದಿಗೆ ಸ್ಪಷ್ಟ ಡೆಮೊ ಮಾರ್ಗ",
      "",
      `${cta}: ನಿಮ್ಮ ನೋಂದಣಿ ಲಿಂಕ್ ಇಲ್ಲಿ ಸೇರಿಸಿ.`,
      "",
      hashtags,
    ],
    sponsor: ({ brand, theme, tracks, sponsorCta, hashtags }) => [
      `${brand}ಗಾಗಿ ಪ್ರಾಯೋಜಕರು ಮತ್ತು ಇಕೋಸಿಸ್ಟಮ್ ಪಾಲುದಾರರನ್ನು ನಾವು ಆಹ್ವಾನಿಸುತ್ತಿದ್ದೇವೆ.`,
      "",
      `ಈ ಈವೆಂಟ್ ${theme} ಮೇಲೆ ಕೇಂದ್ರೀಕೃತವಾಗಿದೆ, ತಂಡಗಳು ${tracks.slice(0, 3).join(", ")} ಮೇಲೆ ಕೆಲಸ ಮಾಡುತ್ತವೆ.`,
      "",
      "ಪ್ರಾಯೋಜಕರ ಮೌಲ್ಯ:",
      "- ಬ್ರಾಂಡೆಡ್ ಚಾಲೆಂಜ್ ಗೋಚರತೆ",
      "- ಮೆಂಟರ್ ಮತ್ತು ವರ್ಕ್‌ಶಾಪ್ ಸಂಪರ್ಕಗಳು",
      "- ನಿರ್ಮಾತೃಗಳು ಮತ್ತು ಡೆಮೊ-ಡೇ ಪ್ರೋಟೋಟೈಪ್‌ಗಳಿಗೆ ಪ್ರವೇಶ",
      "",
      `${sponsorCta}.`,
      "",
      hashtags,
    ],
    final: ({ brand, theme, duration, cta, hashtags }) => [
      `${brand}ಗಾಗಿ ಕೊನೆಯ ಆಹ್ವಾನ.`,
      "",
      `${theme}ಗಾಗಿ ಪ್ರಾಯೋಗಿಕ ಪರಿಹಾರಗಳನ್ನು ನಿರ್ಮಿಸಲು ಬಯಸಿದರೆ, ಇದು ಸರಿಯಾದ ವೇದಿಕೆ.`,
      "",
      `ಒಂದು ಸಮಸ್ಯೆ, ಒಂದು ಕೌಶಲ್ಯ ಅಥವಾ ನಿರ್ಮಿಸುವ ಕುತೂಹಲವನ್ನು ತರಿರಿ. ${duration} ದಿನಗಳು. ಸ್ಪಷ್ಟ ಟ್ರ್ಯಾಕ್‌ಗಳು. ಮೆಂಟರ್ ಬೆಂಬಲ. ಡೆಮೊ-ಡೇ ವೇಗ.`,
      "",
      `${cta}: ನಿಮ್ಮ ಅರ್ಜಿ ಲಿಂಕ್ ಇಲ್ಲಿ ಸೇರಿಸಿ.`,
      "",
      hashtags,
    ],
    participant: ({ brand, tagline, duration, audience, cta }) => [
      `ಹೇ! ನಾವು ${brand} ಲಾಂಚ್ ಮಾಡುತ್ತಿದ್ದೇವೆ.`,
      "",
      tagline,
      "",
      `ಇದು ${audience}ಗಾಗಿ ${duration}-ದಿನಗಳ ಹ್ಯಾಕಥಾನ್. ತಂಡದೊಂದಿಗೆ ಸೇರಬಹುದು ಅಥವಾ ಒಬ್ಬರೇ ಬಂದು kickoffನಲ್ಲಿ ತಂಡ ರಚಿಸಬಹುದು.`,
      "",
      `${cta}: ಲಿಂಕ್ ಇಲ್ಲಿ ಸೇರಿಸಿ`,
    ],
    partner: ({ brand, theme }) => [
      `ನಮಸ್ಕಾರ, ನಾವು ${brand}ಗಾಗಿ ಪಾಲುದಾರರನ್ನು ಹುಡುಕುತ್ತಿದ್ದೇವೆ.`,
      "",
      `ಹ್ಯಾಕಥಾನ್ ${theme} ಮೇಲೆ ಕೇಂದ್ರೀಕೃತವಾಗಿದೆ. ಪ್ರಾಯೋಜಕರು ಚಾಲೆಂಜ್ ಟ್ರ್ಯಾಕ್‌ಗಳನ್ನು ಬೆಂಬಲಿಸಬಹುದು, ತಂಡಗಳಿಗೆ ಮೆಂಟರ್ ಮಾಡಬಹುದು ಮತ್ತು ಡೆಮೊ-ಡೇ ಗೋಚರತೆ ಪಡೆಯಬಹುದು.`,
      "",
      "ನಾನು ನಿಮಗೆ ಪ್ರಾಯೋಜಕ ಬ್ರೀಫ್ ಕಳುಹಿಸಬಹುದೇ?",
    ],
    reminder: ({ brand, theme }) => [
      `ತ್ವರಿತ ಜ್ಞಾಪನೆ: ${brand}ಗಾಗಿ ಅರ್ಜಿಗಳು ತೆರೆಯಲಾಗಿದೆ.`,
      "",
      `${theme}ನಲ್ಲಿ ಆಸಕ್ತಿ ಇದ್ದರೆ, ಮೆಂಟರ್‌ಗಳು ಮತ್ತು ಸ್ಪಷ್ಟ ಡೆಮೊ ಫಾರ್ಮ್ಯಾಟ್ ಜೊತೆಗೆ ನಿಜವಾದ ಪ್ರೋಟೋಟೈಪ್ ನಿರ್ಮಿಸಲು ಇದು ಉತ್ತಮ ಅವಕಾಶ.`,
      "",
      "ಅರ್ಜಿ ಸಲ್ಲಿಸಿ: ಲಿಂಕ್ ಇಲ್ಲಿ ಸೇರಿಸಿ",
    ],
  },
  te: {
    linkedinKind: "LinkedIn పోస్ట్",
    whatsappKind: "WhatsApp సందేశం",
    launchTitle: "లాంచ్ ప్రకటన",
    sponsorTitle: "స్పాన్సర్ అవుట్‌రీచ్",
    finalTitle: "చివరి పిలుపు",
    participantTitle: "పాల్గొనేవారి ఆహ్వానం",
    partnerTitle: "స్పాన్సర్ / భాగస్వామి నోట్",
    reminderTitle: "రిమైండర్",
    defaultAudience: "బిల్డర్లు, విద్యార్థులు, మెంటర్లు, స్పాన్సర్లు మరియు కమ్యూనిటీ భాగస్వాములు",
    defaultTracks: ["సమస్య రూపకల్పన", "ప్రోటోటైప్ నిర్మాణం", "ప్రభావ ప్రణాళిక"],
    defaultBenefits: ["స్పష్టమైన ఛాలెంజ్ ట్రాక్‌లు", "మెంటర్ సపోర్ట్ మరియు డెమో-డే విజిబిలిటీ"],
    applyNow: "ఇప్పుడే దరఖాస్తు చేయండి",
    sponsorBrief: "స్పాన్సర్ బ్రీఫ్ కోసం రిప్లై ఇవ్వండి",
    urgencies: ["దరఖాస్తులు ప్రారంభమయ్యాయి", "ఇప్పుడు జట్లను ఆహ్వానిస్తున్నాం", "నిర్మించడానికి సిద్ధమేనా?"],
    tagline: (theme) => `${theme} కోసం ఉపయోగకరమైన పరిష్కారాలు నిర్మించండి.`,
    launch: ({ urgency, brand, tagline, duration, audience, theme, benefits, cta, hashtags }) => [
      `${brand} కోసం ${urgency}.`,
      "",
      tagline,
      "",
      `ఈ ${duration}-రోజుల హ్యాకథాన్ ${audience}ను కలిపి ${theme}ను డెమోకు సిద్ధమైన ప్రోటోటైప్‌లుగా మార్చుతుంది.`,
      "",
      "జట్లకు లభించేవి:",
      `- ${benefits[0]}`,
      `- ${benefits[1]}`,
      "- జడ్జింగ్ ప్రమాణాలు మరియు స్పాన్సర్ విజిబిలిటీతో స్పష్టమైన డెమో మార్గం",
      "",
      `${cta}: మీ రిజిస్ట్రేషన్ లింక్‌ను ఇక్కడ జోడించండి.`,
      "",
      hashtags,
    ],
    sponsor: ({ brand, theme, tracks, sponsorCta, hashtags }) => [
      `${brand} కోసం స్పాన్సర్లు మరియు ఎకోసిస్టమ్ భాగస్వాములను ఆహ్వానిస్తున్నాం.`,
      "",
      `ఈ ఈవెంట్ ${theme}పై దృష్టి పెడుతుంది, జట్లు ${tracks.slice(0, 3).join(", ")}పై పనిచేస్తాయి.`,
      "",
      "స్పాన్సర్ విలువ:",
      "- బ్రాండెడ్ ఛాలెంజ్ విజిబిలిటీ",
      "- మెంటర్ మరియు వర్క్‌షాప్ టచ్‌పాయింట్లు",
      "- బిల్డర్లు మరియు డెమో-డే ప్రోటోటైప్‌లకు యాక్సెస్",
      "",
      `${sponsorCta}.`,
      "",
      hashtags,
    ],
    final: ({ brand, theme, duration, cta, hashtags }) => [
      `${brand} కోసం చివరి పిలుపు.`,
      "",
      `${theme} కోసం ఉపయోగకరమైన పరిష్కారాలు నిర్మించాలనుకుంటే, ఇది సరైన వేదిక.`,
      "",
      `ఒక సమస్యను, ఒక నైపుణ్యాన్ని లేదా నిర్మించాలనే ఆసక్తిని తీసుకురండి. ${duration} రోజులు. స్పష్టమైన ట్రాక్‌లు. మెంటర్ సపోర్ట్. డెమో-డే మొమెంటం.`,
      "",
      `${cta}: మీ అప్లికేషన్ లింక్‌ను ఇక్కడ జోడించండి.`,
      "",
      hashtags,
    ],
    participant: ({ brand, tagline, duration, audience, cta }) => [
      `హే! మేము ${brand}ను ప్రారంభిస్తున్నాం.`,
      "",
      tagline,
      "",
      `ఇది ${audience} కోసం ${duration}-రోజుల హ్యాకథాన్. మీరు జట్టుతో చేరవచ్చు లేదా ఒంటరిగా వచ్చి kickoffలో జట్టు ఏర్పాటు చేసుకోవచ్చు.`,
      "",
      `${cta}: లింక్ ఇక్కడ జోడించండి`,
    ],
    partner: ({ brand, theme }) => [
      `నమస్తే, ${brand} కోసం భాగస్వాములను వెతుకుతున్నాం.`,
      "",
      `హ్యాకథాన్ ${theme}పై కేంద్రీకృతమైంది. స్పాన్సర్లు ఛాలెంజ్ ట్రాక్‌లకు మద్దతు ఇవ్వవచ్చు, జట్లకు మెంటర్ చేయవచ్చు మరియు డెమో-డే విజిబిలిటీ పొందవచ్చు.`,
      "",
      "స్పాన్సర్ బ్రీఫ్ పంపాలా?",
    ],
    reminder: ({ brand, theme }) => [
      `త్వరిత రిమైండర్: ${brand} కోసం దరఖాస్తులు ప్రారంభమయ్యాయి.`,
      "",
      `${theme}పై మీకు ఆసక్తి ఉంటే, మెంటర్లు మరియు స్పష్టమైన డెమో ఫార్మాట్‌తో నిజమైన ప్రోటోటైప్ నిర్మించడానికి ఇది మంచి అవకాశం.`,
      "",
      "దరఖాస్తు చేయండి: లింక్ ఇక్కడ జోడించండి",
    ],
  },
  ta: {
    linkedinKind: "LinkedIn பதிவு",
    whatsappKind: "WhatsApp செய்தி",
    launchTitle: "தொடக்க அறிவிப்பு",
    sponsorTitle: "ஸ்பான்சர் தொடர்பு",
    finalTitle: "இறுதி அழைப்பு",
    participantTitle: "பங்கேற்பாளர் அழைப்பு",
    partnerTitle: "ஸ்பான்சர் / கூட்டாளர் குறிப்பு",
    reminderTitle: "நினைவூட்டல்",
    defaultAudience: "உருவாக்குநர்கள், மாணவர்கள், மெண்டர்கள், ஸ்பான்சர்கள் மற்றும் சமூக கூட்டாளர்கள்",
    defaultTracks: ["பிரச்சினை வடிவமைப்பு", "ப்ரோட்டோடைப் உருவாக்கம்", "தாக்க திட்டம்"],
    defaultBenefits: ["தெளிவான சவால் பாதைகள்", "மெண்டர் ஆதரவு மற்றும் டெமோ-டே காட்சிப்படுத்தல்"],
    applyNow: "இப்போது விண்ணப்பிக்கவும்",
    sponsorBrief: "ஸ்பான்சர் சுருக்கத்துக்கு பதிலளிக்கவும்",
    urgencies: ["விண்ணப்பங்கள் திறந்துள்ளன", "இப்போது அணிகளை அழைக்கிறோம்", "உருவாக்கத் தயாரா?"],
    tagline: (theme) => `${theme}க்கான நடைமுறை தீர்வுகளை உருவாக்குங்கள்.`,
    launch: ({ urgency, brand, tagline, duration, audience, theme, benefits, cta, hashtags }) => [
      `${brand}க்கு ${urgency}.`,
      "",
      tagline,
      "",
      `இந்த ${duration}-நாள் ஹாக்கத்தான் ${audience}யை ஒன்றிணைத்து ${theme}யை டெமோக்கு தயாரான ப்ரோட்டோடைப்புகளாக மாற்றுகிறது.`,
      "",
      "அணிகளுக்கு கிடைப்பவை:",
      `- ${benefits[0]}`,
      `- ${benefits[1]}`,
      "- தீர்ப்பளிப்பு அளவுகோல்கள் மற்றும் ஸ்பான்சர் காட்சிப்படுத்தலுடன் நடைமுறை டெமோ பாதை",
      "",
      `${cta}: உங்கள் பதிவு இணைப்பை இங்கே சேர்க்கவும்.`,
      "",
      hashtags,
    ],
    sponsor: ({ brand, theme, tracks, sponsorCta, hashtags }) => [
      `${brand}க்காக ஸ்பான்சர்கள் மற்றும் ecosystem கூட்டாளர்களை அழைக்கிறோம்.`,
      "",
      `இந்த நிகழ்வு ${theme} மீது கவனம் செலுத்துகிறது; அணிகள் ${tracks.slice(0, 3).join(", ")} மீது பணிபுரியும்.`,
      "",
      "ஸ்பான்சர் மதிப்பு:",
      "- பிராண்டட் சவால் காட்சிப்படுத்தல்",
      "- மெண்டர் மற்றும் பணிமனை தொடுப்புகள்",
      "- உருவாக்குநர்கள் மற்றும் டெமோ-டே ப்ரோட்டோடைப்புகளுக்கான அணுகல்",
      "",
      `${sponsorCta}.`,
      "",
      hashtags,
    ],
    final: ({ brand, theme, duration, cta, hashtags }) => [
      `${brand}க்கான இறுதி அழைப்பு.`,
      "",
      `${theme}க்கான நடைமுறை தீர்வுகளை உருவாக்க விரும்பினால், இதுவே சரியான இடம்.`,
      "",
      `ஒரு பிரச்சினை, ஒரு திறன் அல்லது உருவாக்கும் ஆர்வத்தை கொண்டு வாருங்கள். ${duration} நாட்கள். தெளிவான பாதைகள். மெண்டர் ஆதரவு. டெமோ-டே முன்னேற்றம்.`,
      "",
      `${cta}: உங்கள் விண்ணப்ப இணைப்பை இங்கே சேர்க்கவும்.`,
      "",
      hashtags,
    ],
    participant: ({ brand, tagline, duration, audience, cta }) => [
      `ஹாய்! நாங்கள் ${brand}யை தொடங்குகிறோம்.`,
      "",
      tagline,
      "",
      `இது ${audience}க்கான ${duration}-நாள் ஹாக்கத்தான். நீங்கள் அணியுடன் சேரலாம் அல்லது தனியாக வந்து kickoffல் அணி அமைக்கலாம்.`,
      "",
      `${cta}: இணைப்பை இங்கே சேர்க்கவும்`,
    ],
    partner: ({ brand, theme }) => [
      `வணக்கம், ${brand}க்காக கூட்டாளர்களை தேடுகிறோம்.`,
      "",
      `ஹாக்கத்தான் ${theme} மீது கவனம் செலுத்துகிறது. ஸ்பான்சர்கள் சவால் பாதைகளை ஆதரிக்கலாம், அணிகளுக்கு மெண்டர் செய்யலாம், டெமோ-டே காட்சிப்படுத்தலைப் பெறலாம்.`,
      "",
      "ஸ்பான்சர் சுருக்கத்தை அனுப்பலாமா?",
    ],
    reminder: ({ brand, theme }) => [
      `சிறிய நினைவூட்டல்: ${brand}க்கான விண்ணப்பங்கள் திறந்துள்ளன.`,
      "",
      `${theme} மீது ஆர்வம் இருந்தால், மெண்டர்கள் மற்றும் தெளிவான டெமோ வடிவத்துடன் உண்மையான ப்ரோட்டோடைப் உருவாக்க இது நல்ல வாய்ப்பு.`,
      "",
      "விண்ணப்பிக்க: இணைப்பை இங்கே சேர்க்கவும்",
    ],
  },
  ml: {
    linkedinKind: "LinkedIn പോസ്റ്റ്",
    whatsappKind: "WhatsApp സന്ദേശം",
    launchTitle: "ലോഞ്ച് പ്രഖ്യാപനം",
    sponsorTitle: "സ്പോൺസർ സമീപനം",
    finalTitle: "അവസാന വിളി",
    participantTitle: "പങ്കാളി ക്ഷണം",
    partnerTitle: "സ്പോൺസർ / പങ്കാളി കുറിപ്പ്",
    reminderTitle: "ഓർമ്മപ്പെടുത്തൽ",
    defaultAudience: "ബിൽഡർമാർ, വിദ്യാർത്ഥികൾ, മെന്റർമാർ, സ്പോൺസർമാർ, കമ്മ്യൂണിറ്റി പങ്കാളികൾ",
    defaultTracks: ["പ്രശ്ന രൂപകൽപ്പന", "പ്രോട്ടോടൈപ്പ് നിർമ്മാണം", "പ്രഭാവ പദ്ധതി"],
    defaultBenefits: ["വ്യക്തമായ ചലഞ്ച് ട്രാക്കുകൾ", "മെന്റർ പിന്തുണയും ഡെമോ-ഡേ ദൃശ്യമാനതയും"],
    applyNow: "ഇപ്പോൾ അപേക്ഷിക്കുക",
    sponsorBrief: "സ്പോൺസർ ബ്രീഫിന് മറുപടി നൽകുക",
    urgencies: ["അപേക്ഷകൾ തുറന്നിരിക്കുന്നു", "ഇപ്പോൾ ടീമുകളെ ക്ഷണിക്കുന്നു", "നിർമ്മിക്കാൻ തയ്യാറാണോ?"],
    tagline: (theme) => `${theme}ക്കായി പ്രായോഗിക പരിഹാരങ്ങൾ നിർമ്മിക്കുക.`,
    launch: ({ urgency, brand, tagline, duration, audience, theme, benefits, cta, hashtags }) => [
      `${brand}ക്കായി ${urgency}.`,
      "",
      tagline,
      "",
      `ഈ ${duration}-ദിവസത്തെ ഹാക്കത്തോൺ ${audience}നെ ഒന്നിപ്പിച്ച് ${theme}യെ ഡെമോ-തയ്യാർ പ്രോട്ടോടൈപ്പുകളാക്കി മാറ്റുന്നു.`,
      "",
      "ടീമുകൾക്ക് ലഭിക്കുന്നത്:",
      `- ${benefits[0]}`,
      `- ${benefits[1]}`,
      "- വിധിനിർണയ മാനദണ്ഡങ്ങളും സ്പോൺസർ ദൃശ്യമാനതയും ഉള്ള പ്രായോഗിക ഡെമോ പാത",
      "",
      `${cta}: നിങ്ങളുടെ രജിസ്ട്രേഷൻ ലിങ്ക് ഇവിടെ ചേർക്കുക.`,
      "",
      hashtags,
    ],
    sponsor: ({ brand, theme, tracks, sponsorCta, hashtags }) => [
      `${brand}ക്കായി സ്പോൺസർമാരെയും ecosystem പങ്കാളികളെയും ക്ഷണിക്കുന്നു.`,
      "",
      `ഈ ഇവന്റ് ${theme}യിൽ ശ്രദ്ധ കേന്ദ്രീകരിക്കുന്നു, ടീമുകൾ ${tracks.slice(0, 3).join(", ")}യിൽ പ്രവർത്തിക്കും.`,
      "",
      "സ്പോൺസർ മൂല്യം:",
      "- ബ്രാൻഡഡ് ചലഞ്ച് ദൃശ്യമാനത",
      "- മെന്റർ, വർക്ക്‌ഷോപ്പ് ടച്ച്‌പോയിന്റുകൾ",
      "- ബിൽഡർമാർക്കും ഡെമോ-ഡേ പ്രോട്ടോടൈപ്പുകൾക്കും പ്രവേശനം",
      "",
      `${sponsorCta}.`,
      "",
      hashtags,
    ],
    final: ({ brand, theme, duration, cta, hashtags }) => [
      `${brand}ക്കായുള്ള അവസാന വിളി.`,
      "",
      `${theme}ക്കായി പ്രായോഗിക പരിഹാരങ്ങൾ നിർമ്മിക്കാൻ ആഗ്രഹിക്കുന്നുവെങ്കിൽ, ഇതാണ് ശരിയായ വേദി.`,
      "",
      `ഒരു പ്രശ്നം, ഒരു കഴിവ്, അല്ലെങ്കിൽ നിർമ്മിക്കാനുള്ള കൗതുകം കൊണ്ടുവരൂ. ${duration} ദിവസം. വ്യക്തമായ ട്രാക്കുകൾ. മെന്റർ പിന്തുണ. ഡെമോ-ഡേ ഗതി.`,
      "",
      `${cta}: നിങ്ങളുടെ അപേക്ഷാ ലിങ്ക് ഇവിടെ ചേർക്കുക.`,
      "",
      hashtags,
    ],
    participant: ({ brand, tagline, duration, audience, cta }) => [
      `ഹേയ്! ഞങ്ങൾ ${brand} ലോഞ്ച് ചെയ്യുന്നു.`,
      "",
      tagline,
      "",
      `ഇത് ${audience}ക്കായുള്ള ${duration}-ദിവസത്തെ ഹാക്കത്തോൺ ആണ്. ടീമിനൊപ്പം ചേരാം, അല്ലെങ്കിൽ ഒറ്റയ്ക്ക് വന്ന് kickoffൽ ടീം രൂപീകരിക്കാം.`,
      "",
      `${cta}: ലിങ്ക് ഇവിടെ ചേർക്കുക`,
    ],
    partner: ({ brand, theme }) => [
      `നമസ്കാരം, ${brand}ക്കായി പങ്കാളികളെ അന്വേഷിക്കുന്നു.`,
      "",
      `ഹാക്കത്തോൺ ${theme}യിൽ കേന്ദ്രീകരിച്ചിരിക്കുന്നു. സ്പോൺസർമാർക്ക് ചലഞ്ച് ട്രാക്കുകൾ പിന്തുണയ്ക്കാം, ടീമുകൾക്ക് മെന്റർ ചെയ്യാം, ഡെമോ-ഡേ ദൃശ്യമാനത നേടാം.`,
      "",
      "സ്പോൺസർ ബ്രീഫ് അയക്കാമോ?",
    ],
    reminder: ({ brand, theme }) => [
      `ചെറു ഓർമ്മപ്പെടുത്തൽ: ${brand}ക്കായുള്ള അപേക്ഷകൾ തുറന്നിരിക്കുന്നു.`,
      "",
      `${theme}യിൽ താൽപ്പര്യമുണ്ടെങ്കിൽ, മെന്റർമാരും വ്യക്തമായ ഡെമോ ഫോർമാറ്റും കൂടെ ഒരു യഥാർത്ഥ പ്രോട്ടോടൈപ്പ് നിർമ്മിക്കാൻ നല്ല അവസരമാണ് ഇത്.`,
      "",
      "അപേക്ഷിക്കുക: ലിങ്ക് ഇവിടെ ചേർക്കുക",
    ],
  },
  ur: {
    linkedinKind: "LinkedIn پوسٹ",
    whatsappKind: "WhatsApp پیغام",
    launchTitle: "لانچ اعلان",
    sponsorTitle: "اسپانسر رابطہ",
    finalTitle: "آخری دعوت",
    participantTitle: "شرکت کی دعوت",
    partnerTitle: "اسپانسر / پارٹنر نوٹ",
    reminderTitle: "یاد دہانی",
    defaultAudience: "بلڈرز، طلبہ، مینٹرز، اسپانسرز اور کمیونٹی پارٹنرز",
    defaultTracks: ["مسئلہ فریمنگ", "پروٹوٹائپ بنانا", "اثر کی منصوبہ بندی"],
    defaultBenefits: ["واضح چیلنج ٹریکس", "مینٹر سپورٹ اور ڈیمو ڈے نمائش"],
    applyNow: "ابھی درخواست دیں",
    sponsorBrief: "اسپانسر بریف کے لیے جواب دیں",
    urgencies: ["درخواستیں کھلی ہیں", "اب ٹیموں کو مدعو کیا جا رہا ہے", "بنانے کے لیے تیار ہیں؟"],
    tagline: (theme) => `${theme} کے لیے عملی حل بنائیں۔`,
    launch: ({ urgency, brand, tagline, duration, audience, theme, benefits, cta, hashtags }) => [
      `${brand} کے لیے ${urgency}`,
      "",
      tagline,
      "",
      `یہ ${duration} دن کا ہیکاتھون ${audience} کو اکٹھا کر کے ${theme} کو ڈیمو کے لیے تیار پروٹوٹائپس میں بدلتا ہے۔`,
      "",
      "ٹیموں کو ملے گا:",
      `- ${benefits[0]}`,
      `- ${benefits[1]}`,
      "- ججنگ معیار اور اسپانسر نمائش کے ساتھ واضح ڈیمو راستہ",
      "",
      `${cta}: اپنا رجسٹریشن لنک یہاں شامل کریں۔`,
      "",
      hashtags,
    ],
    sponsor: ({ brand, theme, tracks, sponsorCta, hashtags }) => [
      `ہم ${brand} کے لیے اسپانسرز اور ecosystem پارٹنرز کو مدعو کر رہے ہیں۔`,
      "",
      `یہ ایونٹ ${theme} پر مرکوز ہے، جہاں ٹیمیں ${tracks.slice(0, 3).join("، ")} پر کام کریں گی۔`,
      "",
      "اسپانسر ویلیو:",
      "- برانڈڈ چیلنج نمائش",
      "- مینٹر اور ورکشاپ ٹچ پوائنٹس",
      "- بلڈرز اور ڈیمو ڈے پروٹوٹائپس تک رسائی",
      "",
      `${sponsorCta}۔`,
      "",
      hashtags,
    ],
    final: ({ brand, theme, duration, cta, hashtags }) => [
      `${brand} کے لیے آخری دعوت۔`,
      "",
      `اگر آپ ${theme} کے لیے عملی حل بنانا چاہتے ہیں، تو یہ بہترین جگہ ہے۔`,
      "",
      `ایک مسئلہ، ایک ہنر، یا صرف بنانے کا شوق ساتھ لائیں۔ ${duration} دن۔ واضح ٹریکس۔ مینٹر سپورٹ۔ ڈیمو ڈے رفتار۔`,
      "",
      `${cta}: اپنا درخواست لنک یہاں شامل کریں۔`,
      "",
      hashtags,
    ],
    participant: ({ brand, tagline, duration, audience, cta }) => [
      `ہیلو! ہم ${brand} لانچ کر رہے ہیں۔`,
      "",
      tagline,
      "",
      `یہ ${audience} کے لیے ${duration} دن کا ہیکاتھون ہے۔ آپ ٹیم کے ساتھ شامل ہو سکتے ہیں یا اکیلے آ کر kickoff پر ٹیم بنا سکتے ہیں۔`,
      "",
      `${cta}: لنک یہاں شامل کریں`,
    ],
    partner: ({ brand, theme }) => [
      `ہیلو، ہم ${brand} کے لیے پارٹنرز تلاش کر رہے ہیں۔`,
      "",
      `یہ ہیکاتھون ${theme} پر مرکوز ہے۔ اسپانسرز چیلنج ٹریکس کو سپورٹ کر سکتے ہیں، ٹیموں کو مینٹر کر سکتے ہیں، اور ڈیمو ڈے نمائش حاصل کر سکتے ہیں۔`,
      "",
      "کیا میں آپ کو اسپانسر بریف بھیج سکتا ہوں؟",
    ],
    reminder: ({ brand, theme }) => [
      `فوری یاد دہانی: ${brand} کے لیے درخواستیں کھلی ہیں۔`,
      "",
      `اگر آپ ${theme} میں دلچسپی رکھتے ہیں، تو مینٹرز اور واضح ڈیمو فارمیٹ کے ساتھ حقیقی پروٹوٹائپ بنانے کا یہ اچھا موقع ہے۔`,
      "",
      "درخواست دیں: لنک یہاں شامل کریں",
    ],
  },
};

const TERM_TRANSLATIONS = {
  hi: {
    "water waste management": "जल अपशिष्ट प्रबंधन",
    "urban heat": "शहरी गर्मी",
    "urban heat mitigation": "शहरी गर्मी न्यूनीकरण",
    students: "छात्र",
    "university students": "विश्वविद्यालय के छात्र",
  },
  kn: {
    "water waste management": "ನೀರಿನ ತ್ಯಾಜ್ಯ ನಿರ್ವಹಣೆ",
    "urban heat": "ನಗರ ಉಷ್ಣತೆ",
    "urban heat mitigation": "ನಗರ ಉಷ್ಣತೆ ಕಡಿತ",
    students: "ವಿದ್ಯಾರ್ಥಿಗಳು",
    "university students": "ವಿಶ್ವವಿದ್ಯಾಲಯ ವಿದ್ಯಾರ್ಥಿಗಳು",
  },
  te: {
    "water waste management": "నీటి వ్యర్థాల నిర్వహణ",
    "urban heat": "పట్టణ వేడి",
    "urban heat mitigation": "పట్టణ వేడి తగ్గింపు",
    students: "విద్యార్థులు",
    "university students": "విశ్వవిద్యాలయ విద్యార్థులు",
  },
  ta: {
    "water waste management": "நீர் கழிவு மேலாண்மை",
    "urban heat": "நகர்ப்புற வெப்பம்",
    "urban heat mitigation": "நகர்ப்புற வெப்ப குறைப்பு",
    students: "மாணவர்கள்",
    "university students": "பல்கலைக்கழக மாணவர்கள்",
  },
  ml: {
    "water waste management": "ജല മാലിന്യ മാനേജ്മെന്റ്",
    "urban heat": "നഗര ചൂട്",
    "urban heat mitigation": "നഗര ചൂട് കുറയ്ക്കൽ",
    students: "വിദ്യാർത്ഥികൾ",
    "university students": "സർവകലാശാല വിദ്യാർത്ഥികൾ",
  },
  ur: {
    "water waste management": "پانی کے فضلے کا انتظام",
    "urban heat": "شہری گرمی",
    "urban heat mitigation": "شہری گرمی میں کمی",
    students: "طلبہ",
    "university students": "یونیورسٹی طلبہ",
  },
};

export default function MessageGenerator() {
  const { t, lang } = useTranslation();
  const { recent } = useEventStore();
  const [remote, setRemote] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [pkg, setPkg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [channel, setChannel] = useState("linkedin");
  const [variantSeed, setVariantSeed] = useState(0);

  useEffect(() => {
    api.listEvents().then((events) => setRemote(Array.isArray(events) ? events : [])).catch(() => {
      /* local missions remain the fallback */
    });
  }, []);

  const missions = useMemo(() => mergeMissions(remote, recent), [remote, recent]);

  useEffect(() => {
    if (selectedId || missions.length === 0) return;
    const ready = missions.find((mission) => mission.status === "ready" || mission.status === "launched");
    setSelectedId(String((ready || missions[0]).id));
  }, [missions, selectedId]);

  const mission = missions.find((item) => String(item.id) === String(selectedId));

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPkg(null);

    api
      .getEventOutput(selectedId)
      .then((response) => {
        if (cancelled) return;
        const output = response?.output || {};
        setPkg(Object.keys(output).length ? output : null);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const drafts = useMemo(() => buildDrafts({ mission, pkg, seed: variantSeed, lang }), [mission, pkg, variantSeed, lang]);
  const activeDrafts = drafts[channel] || [];
  const ChannelIcon = CHANNELS[channel].icon;

  if (missions.length === 0) {
    return (
      <div className="empty-state panel-colorful" style={{ maxWidth: 620 }}>
        <p style={{ marginBottom: 22, fontSize: 18 }}>{messageUi(lang, "noMission")}</p>
        <Link href="/create-event" className="btn btn-primary">
          <Send size={16} /> {t("common.newLaunch")}
        </Link>
      </div>
    );
  }

  return (
    <div className="stack" style={{ maxWidth: 980, gap: 24 }}>
      <div className="row-between">
        <div>
          <div className="eyebrow">{messageUi(lang, "eyebrow")}</div>
          <h1 style={{ fontSize: 30, marginTop: 8 }}>{messageUi(lang, "title")}</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 16, marginTop: 8 }}>
            {messageUi(lang, "subtitle")}
          </p>
        </div>
        <span className="badge ok">{messageUi(lang, "noTokens")}</span>
      </div>

      <div className="panel panel-pad panel-colorful">
        <div className="grid-2" style={{ gridTemplateColumns: "1fr 240px", alignItems: "end" }}>
          <div>
            <label className="label">{messageUi(lang, "mission")}</label>
            <select className="select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {missions.map((item) => (
                <option key={item.id} value={item.id}>
                  #{item.id} {item.theme || t("dashboard.untitled")}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-ghost" onClick={() => setVariantSeed((value) => value + 1)}>
            <RefreshCw size={16} /> {messageUi(lang, "refresh")}
          </button>
        </div>

        <div className="row" style={{ gap: 10, flexWrap: "wrap", marginTop: 18 }}>
          {Object.entries(CHANNELS).map(([key, meta]) => {
            const Icon = meta.icon;
            return (
              <button key={key} className={`tab ${channel === key ? "active" : ""}`} onClick={() => setChannel(key)}>
                <Icon size={15} /> {messageUi(lang, meta.uiKey)}
              </button>
            );
          })}
        </div>
      </div>

      {loading && (
        <div className="panel panel-pad panel-colorful" style={{ opacity: 0.72 }}>
          <Loader2 size={18} className="spin" /> {t("common.loading")}
        </div>
      )}

      {error && (
        <div className="error-banner">
          <FileWarning size={17} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{messageUi(lang, "packageFallback")}</span>
        </div>
      )}

      <div className="grid-2">
        {activeDrafts.map((draft) => (
          <MessageCard key={draft.title} draft={draft} icon={ChannelIcon} t={t} lang={lang} />
        ))}
      </div>
    </div>
  );
}

function MessageCard({ draft, icon: Icon, t, lang }) {
  const [copied, setCopied] = useState(false);
  const isRtl = lang === "ur";

  async function copyText() {
    try {
      await navigator.clipboard.writeText(draft.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* Clipboard may be blocked in some browsers. */
    }
  }

  return (
    <div className="panel panel-pad panel-colorful" dir={isRtl ? "rtl" : "ltr"}>
      <div className="row-between" style={{ gap: 14, marginBottom: 14 }}>
        <div className="row" style={{ gap: 10 }}>
          <Icon size={18} color="var(--info)" />
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{draft.title}</div>
            <div className="eyebrow" style={{ marginTop: 4 }}>{draft.kind}</div>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={copyText}>
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? t("campaignBuilder.copied") : t("campaignBuilder.copy")}
        </button>
      </div>
      <pre
        className="mono"
        dir={isRtl ? "rtl" : "auto"}
        style={{ whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.65, color: "var(--text)", fontSize: 14 }}
      >
        {draft.text}
      </pre>
    </div>
  );
}

function messageUi(lang, key) {
  return MESSAGE_UI[lang]?.[key] || MESSAGE_UI.en[key] || key;
}

function localizeTerm(value, lang) {
  if (!value) return "";
  const normalized = String(value).trim().toLowerCase();
  return TERM_TRANSLATIONS[lang]?.[normalized] || String(value);
}

function mergeMissions(remote, recent) {
  const map = new Map();
  [...remote, ...recent].forEach((mission) => {
    if (mission?.id !== undefined && !map.has(String(mission.id))) {
      map.set(String(mission.id), mission);
    }
  });
  return Array.from(map.values());
}

function buildDrafts({ mission, pkg, seed, lang }) {
  const copy = COPY_LOCALE[lang] || COPY_LOCALE.en;
  const brand = pkg?.branding?.selected_name || titleCase(mission?.theme || "Your Hackathon");
  const rawTheme = mission?.theme || pkg?.research?.recommended_positioning || brand;
  const theme = localizeTerm(rawTheme, lang);
  const tagline = lang === "en" && pkg?.branding?.tagline ? pkg.branding.tagline : copy.tagline(theme);
  const audience = localizeTerm(mission?.audience, lang) || copy.defaultAudience;
  const duration = mission?.constraints?.duration_days || pkg?.operations?.timeline?.length || 2;
  const cta = lang === "en" && pkg?.content?.landing_page?.primary_cta ? pkg.content.landing_page.primary_cta : copy.applyNow;
  const sponsorCta =
    lang === "en" && pkg?.content?.landing_page?.secondary_cta
      ? pkg.content.landing_page.secondary_cta
      : copy.sponsorBrief;
  const tracks =
    lang === "en" && pkg?.content?.sponsor_pitch_outline?.[2]?.talking_points
      ? pkg.content.sponsor_pitch_outline[2].talking_points
      : copy.defaultTracks;
  const benefits =
    lang === "en" && pkg?.research?.audience_insights?.length
      ? pkg.research.audience_insights.slice(0, 2)
      : copy.defaultBenefits;
  const hashtags = buildHashtags(rawTheme, brand);
  const urgency = copy.urgencies[seed % copy.urgencies.length];
  const base = { urgency, brand, tagline, duration, audience, theme, benefits, cta, tracks, sponsorCta, hashtags };

  return {
    linkedin: [
      {
        title: copy.launchTitle,
        kind: copy.linkedinKind,
        text: copy.launch(base).join("\n"),
      },
      {
        title: copy.sponsorTitle,
        kind: copy.linkedinKind,
        text: copy.sponsor(base).join("\n"),
      },
      {
        title: copy.finalTitle,
        kind: copy.linkedinKind,
        text: copy.final(base).join("\n"),
      },
    ],
    whatsapp: [
      {
        title: copy.participantTitle,
        kind: copy.whatsappKind,
        text: copy.participant(base).join("\n"),
      },
      {
        title: copy.partnerTitle,
        kind: copy.whatsappKind,
        text: copy.partner(base).join("\n"),
      },
      {
        title: copy.reminderTitle,
        kind: copy.whatsappKind,
        text: copy.reminder(base).join("\n"),
      },
    ],
  };
}

function buildHashtags(theme, brand) {
  const words = `${theme} ${brand}`
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 2)
    .slice(0, 3);
  const tags = Array.from(new Set([...words.map((word) => `#${titleCase(word).replace(/\s/g, "")}`), "#Hackathon", "#BuildInPublic"]));
  return tags.slice(0, 5).join(" ");
}

function titleCase(value) {
  return String(value)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
