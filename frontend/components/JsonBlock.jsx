import { useTranslation } from "../lib/i18n/context";

const EMPTY_LABEL = {
  en: "None listed.",
  hi: "कुछ सूचीबद्ध नहीं।",
  kn: "ಯಾವುದೂ ಪಟ್ಟಿ ಮಾಡಿಲ್ಲ.",
  te: "ఏదీ జాబితా చేయలేదు.",
  ta: "எதுவும் பட்டியலிடப்படவில்லை.",
  ml: "ഒന്നും പട്ടികപ്പെടുത്തിയിട്ടില്ല.",
  ur: "کچھ درج نہیں۔",
};

const BOOL_LABEL = {
  en: ["Yes", "No"],
  hi: ["हाँ", "नहीं"],
  kn: ["ಹೌದು", "ಇಲ್ಲ"],
  te: ["అవును", "కాదు"],
  ta: ["ஆம்", "இல்லை"],
  ml: ["അതെ", "ഇല്ല"],
  ur: ["ہاں", "نہیں"],
};

const PHRASE_REPLACEMENTS = {
  hi: {
    "water waste management": "जल अपशिष्ट प्रबंधन",
    "urban heat mitigation": "शहरी गर्मी न्यूनीकरण",
    "risks": "जोखिम",
    "trends": "रुझान",
    "confidence": "विश्वास",
    "competitors": "प्रतिस्पर्धी उदाहरण",
    "lesson": "सीख",
    "differentiation": "भिन्नता",
    "audience insights": "दर्शक अंतर्दृष्टि",
    "sponsor targets": "प्रायोजक लक्ष्य",
    "recommended positioning": "अनुशंसित स्थिति",
    "pitch angle": "पिच कोण",
    "memory used": "उपयोग की गई मेमोरी",
    "name options": "नाम विकल्प",
    "selected name": "चुना गया नाम",
    "typography direction": "टाइपोग्राफी दिशा",
    "logo concepts": "लोगो अवधारणाएं",
    "naming guardrails": "नामकरण नियम",
    "landing page": "लैंडिंग पेज",
    "hero headline": "हीरो शीर्षक",
    "primary cta": "मुख्य CTA",
    "secondary cta": "दूसरा CTA",
    "outreach emails": "आउटरीच ईमेल",
    "sponsor pitch outline": "प्रायोजक पिच रूपरेखा",
    "judging rubric": "जजिंग रूब्रिक",
    "risk narrative": "जोखिम विवरण",
    "reusable assets": "दोबारा इस्तेमाल होने वाली सामग्री",
    "campaign name": "अभियान नाम",
    "duration weeks": "अवधि सप्ताह",
    "creative direction": "रचनात्मक दिशा",
    "staffing plan": "टीम योजना",
    "budget breakdown": "बजट विवरण",
    "budget total": "कुल बजट",
    "risks and mitigations": "जोखिम और समाधान",
  },
  kn: {
    "water waste management": "ನೀರಿನ ತ್ಯಾಜ್ಯ ನಿರ್ವಹಣೆ",
    "water waste management challenge": "ನೀರಿನ ತ್ಯಾಜ್ಯ ನಿರ್ವಹಣೆ ಚಾಲೆಂಜ್",
    "urban heat mitigation": "ನಗರ ಉಷ್ಣತೆ ಕಡಿತ",
    "risks": "ಅಪಾಯಗಳು",
    "trends": "ಪ್ರವೃತ್ತಿಗಳು",
    "confidence": "ವಿಶ್ವಾಸ",
    "competitors": "ಸ್ಪರ್ಧಾತ್ಮಕ ಉದಾಹರಣೆಗಳು",
    "lesson": "ಪಾಠ",
    "differentiation": "ಭಿನ್ನತೆ",
    "audience insights": "ಪ್ರೇಕ್ಷಕರ ಒಳನೋಟಗಳು",
    "sponsor targets": "ಪ್ರಾಯೋಜಕ ಗುರಿಗಳು",
    "recommended positioning": "ಶಿಫಾರಸು ಮಾಡಿದ ಸ್ಥಾಪನೆ",
    "pitch angle": "ಪಿಚ್ ಕೋನ",
    "memory used": "ಬಳಸಿದ ಮೆಮೊರಿ",
    "name options": "ಹೆಸರು ಆಯ್ಕೆಗಳು",
    "selected name": "ಆಯ್ಕೆ ಮಾಡಿದ ಹೆಸರು",
    "typography direction": "ಟೈಪೋಗ್ರಫಿ ದಿಕ್ಕು",
    "logo concepts": "ಲೋಗೋ ಕಲ್ಪನೆಗಳು",
    "naming guardrails": "ಹೆಸರಿಡುವ ಮಾರ್ಗಸೂಚಿಗಳು",
    "landing page": "ಲ್ಯಾಂಡಿಂಗ್ ಪುಟ",
    "hero headline": "ಹೀರೋ ಶೀರ್ಷಿಕೆ",
    "subheadline": "ಉಪಶೀರ್ಷಿಕೆ",
    "primary cta": "ಮುಖ್ಯ CTA",
    "secondary cta": "ಎರಡನೇ CTA",
    "outreach emails": "ಔಟ್ರೀಚ್ ಇಮೇಲ್‌ಗಳು",
    "sponsor pitch outline": "ಪ್ರಾಯೋಜಕ ಪಿಚ್ ರೂಪರೇಖೆ",
    "judging rubric": "ತೀರ್ಪುಗಾರಿಕೆ ರೂಬ್ರಿಕ್",
    "risk narrative": "ಅಪಾಯ ವಿವರಣೆ",
    "reusable assets": "ಮರುಬಳಕೆ ಆಸ್ತಿಗಳು",
    "campaign name": "ಅಭಿಯಾನ ಹೆಸರು",
    "duration weeks": "ಅವಧಿ ವಾರಗಳು",
    "creative direction": "ಸೃಜನಾತ್ಮಕ ದಿಕ್ಕು",
    "staffing plan": "ಸಿಬ್ಬಂದಿ ಯೋಜನೆ",
    "budget breakdown": "ಬಜೆಟ್ ವಿವರ",
    "budget total": "ಒಟ್ಟು ಬಜೆಟ್",
    "risks and mitigations": "ಅಪಾಯಗಳು ಮತ್ತು ಪರಿಹಾರಗಳು",
    "broad theme may dilute participant understanding unless tracks are named plainly":
      "ಟ್ರ್ಯಾಕ್‌ಗಳನ್ನು ಸ್ಪಷ್ಟವಾಗಿ ಹೆಸರಿಸದಿದ್ದರೆ ವಿಶಾಲ ವಿಷಯವು ಭಾಗವಹಿಸುವವರ ಅರ್ಥವನ್ನು ದುರ್ಬಲಗೊಳಿಸಬಹುದು",
    "sponsor pitch can become generic if outcomes are not tied to measurable deliverables":
      "ಫಲಿತಾಂಶಗಳನ್ನು ಅಳೆಯಬಹುದಾದ ಡೆಲಿವರಬಲ್‌ಗಳಿಗೆ ಕೊಂಡಿಹಾಕದಿದ್ದರೆ ಪ್ರಾಯೋಜಕ ಪಿಚ್ ಸಾಮಾನ್ಯವಾಗಿ ಕಾಣಬಹುದು",
    "operational scope may exceed team capacity without a clear owner map":
      "ಸ್ಪಷ್ಟ ಮಾಲೀಕರ ನಕ್ಷೆ ಇಲ್ಲದಿದ್ದರೆ ಕಾರ್ಯಾಚರಣೆಯ ವ್ಯಾಪ್ತಿ ತಂಡದ ಸಾಮರ್ಥ್ಯವನ್ನು ಮೀರಬಹುದು",
    "generated content must be checked for regional claims before publication":
      "ಪ್ರಕಟಿಸುವ ಮೊದಲು ಪ್ರಾದೇಶಿಕ ಹೇಳಿಕೆಗಳಿಗಾಗಿ ರಚಿಸಿದ ವಿಷಯವನ್ನು ಪರಿಶೀಲಿಸಬೇಕು",
    "challenge-led positioning creates urgency but can feel narrow":
      "ಚಾಲೆಂಜ್ ಆಧಾರಿತ ಸ್ಥಾಪನೆ ತುರ್ತು ಭಾವನೆ ನೀಡುತ್ತದೆ, ಆದರೆ ಕೆಲವೊಮ್ಮೆ ಸೀಮಿತವಾಗಿ ಕಾಣಬಹುದು",
    "use multiple tracks so teams can choose technical, design, or policy angles":
      "ತಂಡಗಳು ತಾಂತ್ರಿಕ, ವಿನ್ಯಾಸ ಅಥವಾ ನೀತಿ ಕೋನಗಳನ್ನು ಆಯ್ಕೆಮಾಡಲು ಹಲವು ಟ್ರ್ಯಾಕ್‌ಗಳನ್ನು ಬಳಸಿ",
  },
  te: {
    "water waste management": "నీటి వ్యర్థాల నిర్వహణ",
    "urban heat mitigation": "పట్టణ వేడి తగ్గింపు",
    "risks": "ప్రమాదాలు",
    "trends": "ధోరణులు",
    "confidence": "నమ్మకం",
    "competitors": "పోటీ ఉదాహరణలు",
    "lesson": "పాఠం",
    "differentiation": "భిన్నత",
    "audience insights": "ప్రేక్షకుల అంతర్దృష్టులు",
    "sponsor targets": "స్పాన్సర్ లక్ష్యాలు",
    "recommended positioning": "సిఫార్సు చేసిన స్థానీకరణ",
    "pitch angle": "పిచ్ కోణం",
    "campaign name": "క్యాంపెయిన్ పేరు",
    "budget breakdown": "బడ్జెట్ వివరాలు",
    "risks and mitigations": "ప్రమాదాలు మరియు పరిష్కారాలు",
  },
  ta: {
    "water waste management": "நீர் கழிவு மேலாண்மை",
    "urban heat mitigation": "நகர்ப்புற வெப்ப குறைப்பு",
    "risks": "அபாயங்கள்",
    "trends": "போக்குகள்",
    "confidence": "நம்பிக்கை",
    "competitors": "போட்டி உதாரணங்கள்",
    "lesson": "பாடம்",
    "differentiation": "வேறுபாடு",
    "audience insights": "பார்வையாளர் புரிதல்கள்",
    "sponsor targets": "ஸ்பான்சர் இலக்குகள்",
    "recommended positioning": "பரிந்துரைக்கப்பட்ட நிலைமை",
    "pitch angle": "பிட்ச் கோணம்",
    "campaign name": "பிரச்சார பெயர்",
    "budget breakdown": "பட்ஜெட் விவரம்",
    "risks and mitigations": "அபாயங்கள் மற்றும் தீர்வுகள்",
  },
  ml: {
    "water waste management": "ജല മാലിന്യ മാനേജ്മെന്റ്",
    "urban heat mitigation": "നഗര ചൂട് കുറയ്ക്കൽ",
    "risks": "അപകടങ്ങൾ",
    "trends": "പ്രവണതകൾ",
    "confidence": "വിശ്വാസം",
    "competitors": "മത്സര ഉദാഹരണങ്ങൾ",
    "lesson": "പാഠം",
    "differentiation": "വ്യത്യാസം",
    "audience insights": "പ്രേക്ഷക ഉൾക്കാഴ്ചകൾ",
    "sponsor targets": "സ്പോൺസർ ലക്ഷ്യങ്ങൾ",
    "recommended positioning": "ശുപാർശ ചെയ്യുന്ന നിലപാട്",
    "pitch angle": "പിച്ച് കോണം",
    "campaign name": "ക്യാമ്പെയ്ൻ പേര്",
    "budget breakdown": "ബജറ്റ് വിശദാംശം",
    "risks and mitigations": "അപകടങ്ങളും പരിഹാരങ്ങളും",
  },
  ur: {
    "water waste management": "پانی کے فضلے کا انتظام",
    "urban heat mitigation": "شہری گرمی میں کمی",
    "risks": "خطرات",
    "trends": "رجحانات",
    "confidence": "اعتماد",
    "competitors": "مسابقتی مثالیں",
    "lesson": "سبق",
    "differentiation": "فرق",
    "audience insights": "سامعین کی بصیرت",
    "sponsor targets": "اسپانسر اہداف",
    "recommended positioning": "تجویز کردہ پوزیشننگ",
    "pitch angle": "پچ زاویہ",
    "campaign name": "مہم کا نام",
    "budget breakdown": "بجٹ تفصیل",
    "risks and mitigations": "خطرات اور حل",
  },
};

const REPLACEMENTS = {
  hi: [
    [/selected/gi, "चुना गया"], [/name/gi, "नाम"], [/options/gi, "विकल्प"], [/summary/gi, "सारांश"],
    [/research/gi, "अनुसंधान"], [/branding/gi, "ब्रांडिंग"], [/content/gi, "सामग्री"], [/operations/gi, "संचालन"],
    [/campaign/gi, "अभियान"], [/social media/gi, "सोशल मीडिया"], [/timeline/gi, "समयरेखा"], [/tasks/gi, "कार्य"],
    [/budget/gi, "बजट"], [/duration/gi, "अवधि"], [/weeks/gi, "सप्ताह"], [/days/gi, "दिन"],
    [/hackathon/gi, "हैकाथॉन"], [/sponsor/gi, "प्रायोजक"], [/participants/gi, "प्रतिभागी"], [/students/gi, "छात्र"],
    [/builders/gi, "निर्माता"], [/mentors/gi, "मार्गदर्शक"], [/judges/gi, "निर्णायक"], [/prototype/gi, "प्रोटोटाइप"],
    [/launch/gi, "लॉन्च"], [/applications/gi, "आवेदन"], [/ready/gi, "तैयार"], [/issues/gi, "समस्याएं"],
    [/suggestions/gi, "सुझाव"], [/overall/gi, "कुल"], [/approved/gi, "स्वीकृत"],
  ],
  kn: [
    [/selected/gi, "ಆಯ್ದ"], [/name/gi, "ಹೆಸರು"], [/options/gi, "ಆಯ್ಕೆಗಳು"], [/summary/gi, "ಸಾರಾಂಶ"],
    [/research/gi, "ಸಂಶೋಧನೆ"], [/branding/gi, "ಬ್ರ್ಯಾಂಡಿಂಗ್"], [/content/gi, "ವಿಷಯ"], [/operations/gi, "ಕಾರ್ಯಾಚರಣೆಗಳು"],
    [/campaign/gi, "ಅಭಿಯಾನ"], [/social media/gi, "ಸಾಮಾಜಿಕ ಮಾಧ್ಯಮ"], [/timeline/gi, "ಸಮಯರೇಖೆ"], [/tasks/gi, "ಕಾರ್ಯಗಳು"],
    [/budget/gi, "ಬಜೆಟ್"], [/duration/gi, "ಅವಧಿ"], [/weeks/gi, "ವಾರಗಳು"], [/days/gi, "ದಿನಗಳು"],
    [/hackathon/gi, "ಹ್ಯಾಕಥಾನ್"], [/sponsor/gi, "ಪ್ರಾಯೋಜಕ"], [/participants/gi, "ಭಾಗವಹಿಸುವವರು"], [/students/gi, "ವಿದ್ಯಾರ್ಥಿಗಳು"],
    [/builders/gi, "ನಿರ್ಮಾತೃಗಳು"], [/mentors/gi, "ಮಾರ್ಗದರ್ಶಕರು"], [/judges/gi, "ತೀರ್ಪುಗಾರರು"], [/prototype/gi, "ಪ್ರೋಟೋಟೈಪ್"],
    [/launch/gi, "ಲಾಂಚ್"], [/applications/gi, "ಅರ್ಜಿಗಳು"], [/ready/gi, "ಸಿದ್ಧ"], [/issues/gi, "ಸಮಸ್ಯೆಗಳು"],
    [/suggestions/gi, "ಸಲಹೆಗಳು"], [/overall/gi, "ಒಟ್ಟು"], [/approved/gi, "ಅನುಮೋದಿತ"],
  ],
  te: [
    [/selected/gi, "ఎంచుకున్న"], [/name/gi, "పేరు"], [/options/gi, "ఎంపికలు"], [/summary/gi, "సారాంశం"],
    [/research/gi, "పరిశోధన"], [/branding/gi, "బ్రాండింగ్"], [/content/gi, "కంటెంట్"], [/operations/gi, "ఆపరేషన్స్"],
    [/campaign/gi, "క్యాంపెయిన్"], [/social media/gi, "సోషల్ మీడియా"], [/timeline/gi, "టైమ్‌లైన్"], [/tasks/gi, "పనులు"],
    [/budget/gi, "బడ్జెట్"], [/duration/gi, "వ్యవధి"], [/weeks/gi, "వారాలు"], [/days/gi, "రోజులు"],
    [/hackathon/gi, "హ్యాకథాన్"], [/sponsor/gi, "స్పాన్సర్"], [/participants/gi, "పాల్గొనేవారు"], [/students/gi, "విద్యార్థులు"],
    [/builders/gi, "నిర్మాతలు"], [/mentors/gi, "మెంటర్లు"], [/judges/gi, "న్యాయనిర్ణేతలు"], [/prototype/gi, "ప్రోటోటైప్"],
    [/launch/gi, "లాంచ్"], [/applications/gi, "దరఖాస్తులు"], [/ready/gi, "సిద్ధం"], [/issues/gi, "సమస్యలు"],
    [/suggestions/gi, "సూచనలు"], [/overall/gi, "మొత్తం"], [/approved/gi, "ఆమోదించబడింది"],
  ],
  ta: [
    [/selected/gi, "தேர்ந்தெடுத்த"], [/name/gi, "பெயர்"], [/options/gi, "விருப்பங்கள்"], [/summary/gi, "சுருக்கம்"],
    [/research/gi, "ஆராய்ச்சி"], [/branding/gi, "பிராண்டிங்"], [/content/gi, "உள்ளடக்கம்"], [/operations/gi, "செயல்பாடுகள்"],
    [/campaign/gi, "பிரச்சாரம்"], [/social media/gi, "சமூக ஊடகம்"], [/timeline/gi, "காலவரிசை"], [/tasks/gi, "பணிகள்"],
    [/budget/gi, "பட்ஜெட்"], [/duration/gi, "காலம்"], [/weeks/gi, "வாரங்கள்"], [/days/gi, "நாட்கள்"],
    [/hackathon/gi, "ஹேக்கத்தான்"], [/sponsor/gi, "ஸ்பான்சர்"], [/participants/gi, "பங்கேற்பாளர்கள்"], [/students/gi, "மாணவர்கள்"],
    [/builders/gi, "உருவாக்குநர்கள்"], [/mentors/gi, "வழிகாட்டிகள்"], [/judges/gi, "நடுவர்கள்"], [/prototype/gi, "முன்மாதிரி"],
    [/launch/gi, "லாஞ்ச்"], [/applications/gi, "விண்ணப்பங்கள்"], [/ready/gi, "தயார்"], [/issues/gi, "சிக்கல்கள்"],
    [/suggestions/gi, "பரிந்துரைகள்"], [/overall/gi, "மொத்தம்"], [/approved/gi, "அங்கீகரிக்கப்பட்டது"],
  ],
  ml: [
    [/selected/gi, "തിരഞ്ഞെടുത്ത"], [/name/gi, "പേര്"], [/options/gi, "ഓപ്ഷനുകൾ"], [/summary/gi, "സംഗ്രഹം"],
    [/research/gi, "ഗവേഷണം"], [/branding/gi, "ബ്രാൻഡിംഗ്"], [/content/gi, "ഉള്ളടക്കം"], [/operations/gi, "പ്രവർത്തനങ്ങൾ"],
    [/campaign/gi, "ക്യാമ്പെയിൻ"], [/social media/gi, "സോഷ്യൽ മീഡിയ"], [/timeline/gi, "ടൈംലൈൻ"], [/tasks/gi, "പ്രവർത്തികൾ"],
    [/budget/gi, "ബജറ്റ്"], [/duration/gi, "ദൈർഘ്യം"], [/weeks/gi, "ആഴ്ചകൾ"], [/days/gi, "ദിവസങ്ങൾ"],
    [/hackathon/gi, "ഹാക്കത്തോൺ"], [/sponsor/gi, "സ്പോൺസർ"], [/participants/gi, "പങ്കെടുക്കുന്നവർ"], [/students/gi, "വിദ്യാർത്ഥികൾ"],
    [/builders/gi, "നിർമ്മാതാക്കൾ"], [/mentors/gi, "മെന്റർമാർ"], [/judges/gi, "ജഡ്ജിമാർ"], [/prototype/gi, "പ്രോട്ടോടൈപ്പ്"],
    [/launch/gi, "ലോഞ്ച്"], [/applications/gi, "അപേക്ഷകൾ"], [/ready/gi, "തയ്യാർ"], [/issues/gi, "പ്രശ്നങ്ങൾ"],
    [/suggestions/gi, "നിർദ്ദേശങ്ങൾ"], [/overall/gi, "മൊത്തം"], [/approved/gi, "അംഗീകരിച്ചു"],
  ],
  ur: [
    [/selected/gi, "منتخب"], [/name/gi, "نام"], [/options/gi, "اختیارات"], [/summary/gi, "خلاصہ"],
    [/research/gi, "تحقیق"], [/branding/gi, "برانڈنگ"], [/content/gi, "مواد"], [/operations/gi, "آپریشنز"],
    [/campaign/gi, "مہم"], [/social media/gi, "سوشل میڈیا"], [/timeline/gi, "ٹائم لائن"], [/tasks/gi, "کام"],
    [/budget/gi, "بجٹ"], [/duration/gi, "مدت"], [/weeks/gi, "ہفتے"], [/days/gi, "دن"],
    [/hackathon/gi, "ہیکاتھون"], [/sponsor/gi, "اسپانسر"], [/participants/gi, "شرکاء"], [/students/gi, "طلباء"],
    [/builders/gi, "بلڈرز"], [/mentors/gi, "مینٹرز"], [/judges/gi, "ججز"], [/prototype/gi, "پروٹوٹائپ"],
    [/launch/gi, "لانچ"], [/applications/gi, "درخواستیں"], [/ready/gi, "تیار"], [/issues/gi, "مسائل"],
    [/suggestions/gi, "تجاویز"], [/overall/gi, "مجموعی"], [/approved/gi, "منظور"],
  ],
};

export function titleCase(key) {
  return String(key)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isHexColor(v) {
  return typeof v === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function localizeText(value, lang) {
  if (lang === "en") return String(value);
  const phrases = Object.entries(PHRASE_REPLACEMENTS[lang] || {}).sort((a, b) => b[0].length - a[0].length);
  const withPhrases = phrases.reduce(
    (text, [source, replacement]) => text.replace(new RegExp(escapeRegExp(source), "gi"), replacement),
    String(value)
  );
  return (REPLACEMENTS[lang] || []).reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), withPhrases);
}

export default function JsonBlock({ data, depth = 0 }) {
  const { lang } = useTranslation();

  if (data === null || data === undefined) {
    return <span style={{ color: "var(--text-dim)", fontSize: 13 }}>-</span>;
  }

  if (typeof data === "string" || typeof data === "number") {
    if (isHexColor(data)) {
      return (
        <div className="row" style={{ gap: 8 }}>
          <div className="swatch" style={{ width: 32, height: 32, flexShrink: 0, background: data }} />
          <span className="mono" style={{ fontSize: 12.5 }}>{data}</span>
        </div>
      );
    }
    return <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--text)" }}>{localizeText(data, lang)}</p>;
  }

  if (typeof data === "boolean") {
    const labels = BOOL_LABEL[lang] || BOOL_LABEL.en;
    return <span className={`badge ${data ? "ok" : "error"}`}>{data ? labels[0] : labels[1]}</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span style={{ color: "var(--text-dim)", fontSize: 13 }}>{EMPTY_LABEL[lang] || EMPTY_LABEL.en}</span>;
    }
    if (data.every((d) => typeof d === "string" || typeof d === "number")) {
      return (
        <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
          {data.map((d, i) => (
            <li key={i} style={{ fontSize: 13.5, color: "var(--text)" }}>
              {localizeText(d, lang)}
            </li>
          ))}
        </ul>
      );
    }
    return (
      <div className="stack" style={{ gap: 10 }}>
        {data.map((item, i) => (
          <div key={i} className="panel panel-pad" style={{ background: "var(--bg-elevated)" }}>
            <JsonBlock data={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  const entries = Object.entries(data);
  return (
    <div className="stack" style={{ gap: depth === 0 ? 18 : 10 }}>
      {entries.map(([k, v]) => (
        <div key={k}>
          <div className="label">{localizeText(titleCase(k), lang)}</div>
          <JsonBlock data={v} depth={depth + 1} />
        </div>
      ))}
    </div>
  );
}
