/** Live Like a Local (AiExpertView) UI strings — merged into guestLocaleUi. */
export type GuestLocaleAiExpertKey =
  | 'aiExpertConcierge'
  | 'aiExpertYoureIn'
  | 'aiExpertWelcomeBody'
  | 'aiExpertWelcomeCta'
  | 'aiExpertYourStay'
  | 'aiExpertThinking'
  | 'aiExpertCuratingHint'
  | 'aiExpertCuratingStepExplore'
  | 'aiExpertCuratingStepMatch'
  | 'aiExpertCuratingStepBuild'
  | 'aiExpertCuratingStepFinishing'
  | 'aiExpertVerifyingLocation'
  | 'aiExpertFindingLocation'
  | 'aiExpertPlanPicksTitle'
  | 'aiExpertPlanPicksSub'
  | 'aiExpertPlanTimelineTitle'
  | 'aiExpertPlanTimelineSub'
  | 'aiExpertSeenBefore'
  | 'aiExpertBadgeYourStay'
  | 'aiExpertBadgeVailoPick'
  | 'aiExpertView'
  | 'aiExpertGo'
  | 'aiExpertPlanAnotherDay'
  | 'aiExpertYourChoices'
  | 'aiExpertWithinDistance'
  | 'aiExpertFlexibleSchedule'
  | 'aiExpertBrowseOwnPace'
  | 'aiExpertWizardLocation'
  | 'aiExpertWizardCategories'
  | 'aiExpertWizardDistance'
  | 'aiExpertWizardTime'
  | 'aiExpertLocationTitle'
  | 'aiExpertLocationSub'
  | 'aiExpertWhichLocation'
  | 'aiExpertKmFromProperty'
  | 'aiExpertTryDifferentSpelling'
  | 'aiExpertOrEnterTown'
  | 'aiExpertLocationPlaceholder'
  | 'aiExpertSet'
  | 'aiExpertNearProperty'
  | 'aiExpertNearYourProperty'
  | 'aiExpertCategoriesTitle'
  | 'aiExpertCategoriesSub'
  | 'aiExpertLoadingCategories'
  | 'aiExpertContinueSelected'
  | 'aiExpertDistanceTitle'
  | 'aiExpertDistanceSub'
  | 'aiExpertDistanceNearestLine'
  | 'aiExpertDistanceNearestKm'
  | 'aiExpertDistanceNoCuratedPicks'
  | 'aiExpertMappingDistances'
  | 'aiExpertTimeTitle'
  | 'aiExpertTimeSub'
  | 'aiExpertStartDay'
  | 'aiExpertHowLongOut'
  | 'aiExpertPlanTimelineBtn'
  | 'aiExpertBrowseFavoritesBtn'
  | 'aiExpertChatPlaceholder'
  | 'aiExpertChatDisclaimer'
  | 'aiExpertChatAria'
  | 'aiExpertSendAria'
  | 'aiExpertBackAria'
  | 'aiExpertErrorConnect'
  | 'aiExpertErrorPlan'
  | 'aiExpertErrorNoDrive'
  | 'aiExpertErrorTooFarDayTrip'
  | 'aiExpertErrorVerifyFailed'
  | 'aiExpertDidYouMeanSuffix'
  | 'aiExpertGeoNotFound'
  | 'aiExpertGeoHintRegion'
  | 'aiExpertGeoHintCountry'
  | 'aiExpertGeoSeveralMatches'
  | 'aiExpertGeoFarMatch'
  | 'aiExpertGeoTooFarFromProperty'
  | 'aiExpertGeoNearHint'
  | 'aiExpertTheRegion'
  | 'aiExpertAreaInvalidMaster'
  | 'aiExpertAreaMissing'
  | 'aiExpertAreaNoCategories'
  | 'aiExpertDuration3h'
  | 'aiExpertDuration4h'
  | 'aiExpertDuration5h'
  | 'aiExpertDuration6h'
  | 'aiExpertDuration8h'
  | 'aiExpertDuration10h'
  | 'aiExpertDuration12h'
  | 'aiExpertDurationUntilMorning'
  | 'aiExpertHikingTrailsCategory'
  | 'aiExpertViewOnAllTrails'
  | 'aiExpertTrailPicksSub'
  | 'aiExpertEnhancingTrail'
  | 'aiExpertTrailOpenAllTrailsHint'
  | 'aiExpertNoTrailsInRange'
  | 'aiExpertNoPicksInRange'
  | 'aiExpertRefineOrNew'
  | 'aiExpertBestWithin';

export const AI_EXPERT_UI_EN: Record<GuestLocaleAiExpertKey, string> = {
  aiExpertConcierge: 'Vailo Concierge',
  aiExpertYoureIn: "You're in",
  aiExpertWelcomeBody:
    "Forget the guidebooks — I'll show you where people in {area} actually go. The tavernas they pick, the coves they keep quiet, the corners tourists walk past every day.",
  aiExpertWelcomeCta: "I'll show you where locals in {area} actually go.",
  aiExpertYourStay: 'your stay',
  aiExpertThinking: 'Curating your recommendations…',
  aiExpertCuratingHint: 'This usually takes a few moments — we’re being picky on your behalf.',
  aiExpertCuratingStepExplore: 'Exploring what’s nearby',
  aiExpertCuratingStepMatch: 'Matching your interests & distance',
  aiExpertCuratingStepBuild: 'Building your personalised picks',
  aiExpertCuratingStepFinishing: 'Adding the finishing touches',
  aiExpertVerifyingLocation: 'Verifying location…',
  aiExpertFindingLocation: 'Finding your starting point…',
  aiExpertPlanPicksTitle: 'Curated for you',
  aiExpertPlanPicksSub:
    'Real picks from people who know the area — sorted by distance from your start.',
  aiExpertPlanTimelineTitle: 'Your day, thoughtfully planned',
  aiExpertPlanTimelineSub:
    'A practical route from departure to return.',
  aiExpertSeenBefore: 'Seen before',
  aiExpertBadgeYourStay: 'Your stay',
  aiExpertBadgeVailoPick: 'Vailo pick',
  aiExpertView: 'View',
  aiExpertGo: 'Go',
  aiExpertPlanAnotherDay: 'Plan another day',
  aiExpertYourChoices: 'Your choices',
  aiExpertWithinDistance: 'Within {distance}',
  aiExpertFlexibleSchedule: 'Flexible · no fixed schedule',
  aiExpertBrowseOwnPace: 'Browse at my own pace',
  aiExpertWizardLocation: 'Starting point',
  aiExpertWizardCategories: 'Your interests',
  aiExpertWizardDistance: 'Travel range',
  aiExpertWizardTime: 'Your day',
  aiExpertLocationTitle: 'Where does your day begin?',
  aiExpertLocationSub: 'Your starting point shapes every recommendation we make.',
  aiExpertWhichLocation: 'Which location did you mean?',
  aiExpertKmFromProperty: '~{km} km from {name}',
  aiExpertTryDifferentSpelling: 'Try a different spelling',
  aiExpertOrEnterTown: 'or',
  aiExpertLocationPlaceholder: 'other location',
  aiExpertSet: 'Set',
  aiExpertNearProperty: 'Near {name}',
  aiExpertNearYourProperty: 'Near your property',
  aiExpertCategoriesTitle: 'What are you in the mood for?',
  aiExpertCategoriesSub:
    'Choose up to three interests — we’ll find standout places nearby.',
  aiExpertLoadingCategories: 'Loading local categories…',
  aiExpertContinueSelected: 'Continue · {count} selected',
  aiExpertDistanceTitle: 'How far will you venture?',
  aiExpertDistanceSub:
    'From {location} — the best spots are often closer than you think.',
  aiExpertDistanceNearestLine: 'Nearest from your start: {hints}',
  aiExpertDistanceNearestKm: '{category} ~{km} km',
  aiExpertDistanceNoCuratedPicks: '{category} — no curated picks yet (AI from ~10 km)',
  aiExpertMappingDistances: 'Mapping distances from your starting point…',
  aiExpertTimeTitle: 'How would you like to explore?',
  aiExpertTimeSub: "Pick a start time and how long you're out — we'll build your day around it.",
  aiExpertStartDay: 'Start your day',
  aiExpertHowLongOut: 'How long are you out?',
  aiExpertPlanTimelineBtn: 'Plan my day with a timeline',
  aiExpertBrowseFavoritesBtn: 'No fixed schedule. Just browse',
  aiExpertChatPlaceholder: 'Ask Vailo',
  aiExpertChatDisclaimer:
    'Always verify opening hours and routes before you go.',
  aiExpertChatAria: 'Message the concierge',
  aiExpertSendAria: 'Send message',
  aiExpertBackAria: 'Go back',
  aiExpertErrorConnect: "I'm having trouble connecting right now. Please try again in a moment.",
  aiExpertErrorPlan:
    'I apologize, but I encountered an error while generating your plan. Please try asking a custom question below.',
  aiExpertErrorNoDrive:
    'I apologize, but "{place}" cannot be reached by driving from {property}. Please select a different starting point.',
  aiExpertErrorTooFarDayTrip:
    'I apologize, but "{place}" is too far ({km}km) for a day trip. Please select a starting point closer to {property}.',
  aiExpertErrorVerifyFailed: 'I had trouble verifying that location. Please try again.',
  aiExpertDidYouMeanSuffix: 'Did you mean one of these?',
  aiExpertGeoNotFound: 'I couldn\'t find "{input}".',
  aiExpertGeoHintRegion: ' Try adding the region, e.g. "{input}, {area}".',
  aiExpertGeoHintCountry: ' Try adding the region or country.',
  aiExpertGeoSeveralMatches:
    'I found several places matching "{input}" near your area. Which one is your starting point?',
  aiExpertGeoFarMatch:
    '"{input}" matched a place far from the property ({km}km away). Did you mean one of these in {area}?',
  aiExpertGeoTooFarFromProperty:
    '"{input}" is too far ({km}km) for a day trip from the property. Please pick a town closer to your stay{nearHint}.',
  aiExpertGeoNearHint: ' (near {area})',
  aiExpertTheRegion: 'the region',
  aiExpertAreaInvalidMaster:
    'City/Master Area on this listing is set to "{area}", which is not a configured region in Area Functionality. Set it to the master area (e.g. Chania) on the property listing — not the neighborhood or street address.',
  aiExpertAreaMissing:
    'This listing is missing Country or City/Master Area. Your host must set both on the property listing (e.g. Greece and Chania).',
  aiExpertAreaNoCategories:
    'No Local Gems categories are configured for {masterArea}, {country} yet. Your host can add them in Area Functionality → Local Gems Categories.',
  aiExpertDuration3h: '3 hours',
  aiExpertDuration4h: '4 hours',
  aiExpertDuration5h: '5 hours',
  aiExpertDuration6h: '6 hours',
  aiExpertDuration8h: '8 hours',
  aiExpertDuration10h: '10 hours',
  aiExpertDuration12h: '12 hours',
  aiExpertDurationUntilMorning: 'Until 5:30 AM',
  aiExpertHikingTrailsCategory: 'Hiking & Trails',
  aiExpertViewOnAllTrails: 'View on AllTrails',
  aiExpertTrailPicksSub: '{count} trails · nearest first',
  aiExpertEnhancingTrail: 'Polishing trail details…',
  aiExpertTrailOpenAllTrailsHint: 'Open on AllTrails for the full route guide and reviews.',
  aiExpertNoTrailsInRange:
    'No hiking trails in your selected range. Try widening the distance or check back after your host syncs local trails.',
  aiExpertNoPicksInRange:
    'No verified {category} picks within your range. Try widening the distance or choose another interest.',
  aiExpertRefineOrNew:
    'Would you like me to refine the recommendations I just showed, or find something completely new?',
  aiExpertBestWithin: 'best within {distance}',
};

export const AI_EXPERT_UI_EL: Partial<Record<GuestLocaleAiExpertKey, string>> = {
  aiExpertConcierge: 'Vailo Concierge',
  aiExpertYoureIn: 'Βρίσκεστε στο',
  aiExpertWelcomeBody:
    'Ξεχάστε τους ταξιδιωτικούς οδηγούς — θα σας δείξω πού πηγαίνουν στην πραγματικότητα οι ντόπιοι στο/στην {area}. Τα ταβέρνια που επιλέγουν, οι κρυφές ακτές, τις γωνιές που οι τουρίστες προσπερνούν κάθε μέρα.',
  aiExpertWelcomeCta: 'Θα σας δείξω πού πηγαίνουν στην πραγματικότητα οι ντόπιοι στο/στην {area}.',
  aiExpertYourStay: 'τη διαμονή σας',
  aiExpertThinking: 'Ετοιμάζουμε τις τοπικές προτάσεις σας…',
  aiExpertCuratingHint: 'Συνήθως χρειάζονται λίγα λεπτά — επιλέγουμε προσεκτικά για εσάς.',
  aiExpertCuratingStepExplore: 'Εξερευνούμε τι υπάρχει κοντά σας',
  aiExpertCuratingStepMatch: 'Ταιριάζουμε τα ενδιαφέροντα & την απόσταση',
  aiExpertCuratingStepBuild: 'Φτιάχνουμε τις προσωπικές σας επιλογές',
  aiExpertCuratingStepFinishing: 'Προσθέτουμε τις τελικές πινελιές',
  aiExpertVerifyingLocation: 'Επαλήθευση τοποθεσίας…',
  aiExpertFindingLocation: 'Εύρεση σημείου εκκίνησης…',
  aiExpertPlanPicksTitle: 'Επιλεγμένα για εσάς',
  aiExpertPlanPicksSub:
    'Πραγματικές επιλογές από ανθρώπους που γνωρίζουν την περιοχή — ταξινομημένες κατά απόσταση.',
  aiExpertPlanTimelineTitle: 'Η μέρα σας, με σχέδιο',
  aiExpertPlanTimelineSub:
    'Ένα πρακτικό δρομολόγιο από την αναχώρηση μέχρι την επιστροφή.',
  aiExpertSeenBefore: 'Το είδατε πριν',
  aiExpertBadgeYourStay: 'Η διαμονή σας',
  aiExpertBadgeVailoPick: 'Επιλογή Vailo',
  aiExpertView: 'Προβολή',
  aiExpertGo: 'Πάμε',
  aiExpertPlanAnotherDay: 'Νέα μέρα, νέο σχέδιο',
  aiExpertYourChoices: 'Οι επιλογές σας',
  aiExpertWithinDistance: 'Εντός {distance}',
  aiExpertFlexibleSchedule: 'Ευέλικτα · χωρίς σταθερό πρόγραμμα',
  aiExpertBrowseOwnPace: 'Περιήγηση με δικό μου ρυθμό',
  aiExpertWizardLocation: 'Σημείο εκκίνησης',
  aiExpertWizardCategories: 'Ενδιαφέροντα',
  aiExpertWizardDistance: 'Απόσταση',
  aiExpertWizardTime: 'Η μέρα σας',
  aiExpertLocationTitle: 'Από πού ξεκινά η μέρα σας;',
  aiExpertLocationSub: 'Το σημείο εκκίνησης καθορίζει κάθε πρόταση.',
  aiExpertWhichLocation: 'Ποια τοποθεσία εννοείτε;',
  aiExpertKmFromProperty: '~{km} χλμ. από {name}',
  aiExpertTryDifferentSpelling: 'Δοκιμάστε άλλη ορθογραφία',
  aiExpertOrEnterTown: 'ή',
  aiExpertLocationPlaceholder: 'άλλη τοποθεσία',
  aiExpertSet: 'Ορισμός',
  aiExpertNearProperty: 'Κοντά στο {name}',
  aiExpertNearYourProperty: 'Κοντά στο κατάλυμά σας',
  aiExpertCategoriesTitle: 'Τι σας ενδιαφέρει σήμερα;',
  aiExpertCategoriesSub:
    'Επιλέξτε έως τρία ενδιαφέροντα — θα βρούμε ξεχωριστά μέρη κοντά σας.',
  aiExpertLoadingCategories: 'Φόρτωση τοπικών κατηγοριών…',
  aiExpertContinueSelected: 'Συνέχεια · {count} επιλεγμένα',
  aiExpertDistanceTitle: 'Πόσο μακριά θα πάτε;',
  aiExpertDistanceSub:
    'Από {location} — τα καλύτερα συχνά είναι πιο κοντά απ\' ό,τι νομίζετε.',
  aiExpertDistanceNearestLine: 'Πιο κοντά από το σημείο εκκίνησης: {hints}',
  aiExpertDistanceNearestKm: '{category} ~{km} χλμ.',
  aiExpertDistanceNoCuratedPicks: '{category} — χωρίς επιλεγμένα ακόμα (AI από ~10 χλμ.)',
  aiExpertMappingDistances: 'Υπολογισμός αποστάσεων από το σημείο εκκίνησης…',
  aiExpertTimeTitle: 'Πώς θέλετε να εξερευνήσετε;',
  aiExpertTimeSub:
    'Επιλέξτε ώρα έναρξης και διάρκεια — θα χτίσουμε τη μέρα γύρω από αυτές.',
  aiExpertStartDay: 'Έναρξη μέρας',
  aiExpertHowLongOut: 'Πόση ώρα θα είστε έξω;',
  aiExpertPlanTimelineBtn: 'Σχέδιο ημέρας με χρονοδιάγραμμα',
  aiExpertBrowseFavoritesBtn: 'Χωρίς πρόγραμμα. Απλή περιήγηση',
  aiExpertChatPlaceholder: 'Ask Vailo',
  aiExpertChatDisclaimer:
    'Επιβεβαιώστε πάντα ώρες λειτουργίας και διαδρομές πριν φύγετε.',
  aiExpertChatAria: 'Μήνυμα στον concierge',
  aiExpertSendAria: 'Αποστολή',
  aiExpertBackAria: 'Πίσω',
  aiExpertErrorConnect: 'Δυσκολευόμαστε να συνδεθούμε. Δοκιμάστε ξανά σε λίγο.',
  aiExpertErrorPlan:
    'Προέκυψε σφάλμα κατά τη δημιουργία του σχεδίου. Δοκιμάστε μια ερώτηση παρακάτω.',
  aiExpertErrorNoDrive:
    'Λυπούμαστε, το «{place}» δεν είναι προσβάσιμο με αυτοκίνητο από {property}. Επιλέξτε άλλο σημείο εκκίνησης.',
  aiExpertErrorTooFarDayTrip:
    'Λυπούμαστε, το «{place}» είναι πολύ μακριά ({km} χλμ.) για ημερήσια εκδρομή. Επιλέξτε σημείο πιο κοντά στο {property}.',
  aiExpertErrorVerifyFailed: 'Δεν καταφέραμε να επαληθεύσουμε την τοποθεσία. Δοκιμάστε ξανά.',
  aiExpertDidYouMeanSuffix: 'Εννοείτε κάποιο από αυτά;',
  aiExpertGeoNotFound: 'Δεν βρήκαμε το «{input}».',
  aiExpertGeoHintRegion: ' Δοκιμάστε με περιοχή, π.χ. «{input}, {area}».',
  aiExpertGeoHintCountry: ' Προσθέστε περιοχή ή χώρα.',
  aiExpertGeoSeveralMatches:
    'Βρήκαμε πολλές τοποθεσίες για «{input}» κοντά σας. Ποια είναι το σημείο εκκίνησης;',
  aiExpertGeoFarMatch:
    'Το «{input}» ταιριάζει με μέρος μακριά από το κατάλυμα ({km} χλμ.). Εννοείτε κάποιο από αυτά στο/στην {area};',
  aiExpertGeoTooFarFromProperty:
    'Το «{input}» είναι πολύ μακριά ({km} χλμ.) για ημερήσια εκδρομή. Επιλέξτε πιο κοντινή πόλη{nearHint}.',
  aiExpertGeoNearHint: ' (κοντά στο/στην {area})',
  aiExpertTheRegion: 'την περιοχή',
  aiExpertAreaInvalidMaster:
    'Η πόλη/περιοχή master του καταλύματος είναι «{area}», που δεν είναι ρυθμισμένη περιοχή. Ορίστε την σωστή master περιοχή (π.χ. Χανιά) — όχι τη γειτονιά ή τη διεύθυνση.',
  aiExpertAreaMissing:
    'Λείπουν Χώρα ή Πόλη/Master Area. Ο οικοδεσπότης πρέπει να τα συμπληρώσει (π.χ. Ελλάδα και Χανιά).',
  aiExpertAreaNoCategories:
    'Δεν υπάρχουν κατηγορίες Local Gems για {masterArea}, {country}. Ο οικοδεσπότης μπορεί να τις προσθέσει στο Area Functionality → Local Gems Categories.',
  aiExpertDuration3h: '3 ώρες',
  aiExpertDuration4h: '4 ώρες',
  aiExpertDuration5h: '5 ώρες',
  aiExpertDuration6h: '6 ώρες',
  aiExpertDuration8h: '8 ώρες',
  aiExpertDuration10h: '10 ώρες',
  aiExpertDuration12h: '12 ώρες',
  aiExpertDurationUntilMorning: 'Μέχρι 5:30 π.μ.',
  aiExpertHikingTrailsCategory: 'Πεζοπορία & μονοπάτια',
  aiExpertViewOnAllTrails: 'Προβολή στο AllTrails',
  aiExpertTrailPicksSub: '{count} μονοπάτια · πιο κοντινά πρώτα',
  aiExpertEnhancingTrail: 'Βελτιώνουμε την περιγραφή…',
  aiExpertTrailOpenAllTrailsHint: 'Ανοίξτε στο AllTrails για τον πλήρη οδηγό διαδρομής και κριτικές.',
  aiExpertNoTrailsInRange:
    'Δεν υπάρχουν μονοπάτια στην επιλεγμένη απόσταση. Δοκιμάστε μεγαλύτερη ακτίνα ή ελέγξτε αργότερα.',
  aiExpertNoPicksInRange:
    'Δεν βρέθηκαν επαληθευμένες επιλογές για {category} εντός της απόστασής σας. Δοκιμάστε μεγαλύτερη ακτίνα ή άλλο ενδιαφέρον.',
  aiExpertRefineOrNew:
    'Θέλετε να βελτιώσω τις προτάσεις που μόλις σας έδειξα ή να βρω κάτι εντελώς νέο;',
  aiExpertBestWithin: 'καλύτερα εντός {distance}',
};
