// ============================================================
// Site Data â€” Editable content store for the German Trainer site
// Edit this file (or use the Admin API endpoints) to update
// the website content in the future.
// ============================================================

export const siteData = {
  trainer: {
    name: "Meenu",
    title: "Certified German Language Trainer (C2 Â· Goethe-Institut)",
    tagline: "Sprich Deutsch mit Selbstvertrauen â€” Speak German with Confidence!",
    bio: "Hallo! I'm Meenu, a certified German language trainer with over 12 years of experience teaching German to students across the globe. I hold a C2 Goethe-Zertifikat and a Master's degree in German Linguistics. I have helped 2,000+ students crack Goethe, TELC, TestDaF and Ã–SD exams, relocate to Germany for work and studies, and fall in love with the German language and culture. My teaching style blends structured grammar foundations with immersive conversational practice, so you learn to actually SPEAK German â€” not just study it.",
    highlights: [
      "12+ years of teaching experience",
      "2,000+ students trained worldwide",
      "98% exam pass rate (Goethe / TELC / TestDaF)",
      "Master's in German Linguistics",
      "Official Goethe-Institut exam preparation expert"
    ],
    photo: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&q=80",
    email: "meenupkc@gmail.com",
    phone: "+91 98765 43210",
    location: "Online classes worldwide",
    socials: {
      youtube: "https://youtube.com/@meenu-german",
      instagram: "https://instagram.com/meenu.german",
      linkedin: "https://linkedin.com/in/meenu-german"
    }
  },

  courses: [
    {
      id: 1,
      level: "A1",
      title: "German for Absolute Beginners (A1)",
      description: "Start your German journey from zero. Learn the alphabet, greetings, everyday vocabulary, basic grammar and simple conversations.",
      duration: "8 weeks Â· 3 classes/week",
      mode: "Live Online (Zoom)",
      price: "â‚¬199",
      features: ["Live interactive classes", "Study material included", "Weekly assignments", "A1 mock exams", "Certificate of completion"]
    },
    {
      id: 2,
      level: "A2",
      title: "Elementary German (A2)",
      description: "Build on your basics. Handle everyday situations, describe experiences, and communicate in routine tasks with confidence.",
      duration: "10 weeks Â· 3 classes/week",
      mode: "Live Online (Zoom)",
      price: "â‚¬249",
      features: ["Live interactive classes", "Conversation practice sessions", "Grammar workbook", "A2 mock exams", "Certificate of completion"]
    },
    {
      id: 3,
      level: "B1",
      title: "Intermediate German (B1)",
      description: "Reach independence. Discuss opinions, handle work situations, and prepare for the B1 certification required for German citizenship.",
      duration: "12 weeks Â· 3 classes/week",
      mode: "Live Online (Zoom)",
      price: "â‚¬299",
      features: ["Exam-focused training", "Speaking club access", "Writing corrections", "B1 mock exams", "Certificate of completion"]
    },
    {
      id: 4,
      level: "B2",
      title: "Upper-Intermediate German (B2)",
      description: "Master complex texts and fluent spontaneous conversation. Ideal for university admission and professional careers in Germany.",
      duration: "14 weeks Â· 3 classes/week",
      mode: "Live Online (Zoom)",
      price: "â‚¬349",
      features: ["Advanced grammar mastery", "Professional vocabulary", "TestDaF/Goethe B2 prep", "1 free consultation call", "Certificate of completion"]
    },
    {
      id: 5,
      level: "EXAM",
      title: "Goethe/TELC Exam Crash Course",
      description: "Intensive 4-week preparation focused purely on exam strategy, mock tests and personalized feedback for all four modules.",
      duration: "4 weeks Â· 5 classes/week",
      mode: "Live Online (Zoom)",
      price: "â‚¬179",
      features: ["Full mock exams", "Speaking exam simulation", "Letter-writing templates", "Examiner insights", "Score improvement guarantee"]
    },
    {
      id: 6,
      level: "KIDS",
      title: "German for Kids & Teens",
      description: "Fun, engaging German classes designed for young learners aged 8â€“16 with games, stories and interactive activities.",
      duration: "Ongoing Â· 2 classes/week",
      mode: "Live Online (Zoom)",
      price: "â‚¬99/month",
      features: ["Age-appropriate materials", "Gamified learning", "Progress reports for parents", "Small batches (max 6)", "Fit for school curricula"]
    }
  ],

  consultation: {
    title: "One-on-One Paid Consultation",
    description: "Get personalized guidance tailored to your German learning goals â€” whether it's exam strategy, relocation planning, interview preparation, or a customized study roadmap.",
    sessions: [
      {
        id: 1,
        name: "Quick Guidance Call",
        duration: "30 minutes",
        price: "â‚¬25",
        includes: ["Level assessment", "Learning roadmap advice", "Q&A on courses & exams"]
      },
      {
        id: 2,
        name: "Deep-Dive Session",
        duration: "60 minutes",
        price: "â‚¬45",
        includes: ["Detailed level assessment", "Personalized study plan", "Exam strategy session", "Resource recommendations"]
      },
      {
        id: 3,
        name: "Interview / Relocation Prep",
        duration: "90 minutes",
        price: "â‚¬65",
        includes: ["German job interview practice", "Visa interview preparation", "CV & Anschreiben review", "Cultural orientation tips"]
      }
    ],
    bookingNote: "Pick an available slot from Meenu's live Google Calendar below and provide your contact details. You'll receive a calendar invite at your email. Payment via PayPal / bank transfer. Slots available Monâ€“Sat, 9:00â€“19:00."
  },

  reviews: [
    {
      id: 1,
      name: "Priya Sharma",
      country: "India",
      rating: 5,
      course: "B1 Intermediate",
      text: "Meenu is the best German teacher I've ever had! I passed my Goethe B1 exam with 92% on the first attempt. Her speaking practice sessions gave me real confidence."
    },
    {
      id: 2,
      name: "Carlos Mendes",
      country: "Brazil",
      rating: 5,
      course: "A1 + A2 Beginner Track",
      text: "From zero German to holding conversations in 5 months. The classes are structured, fun and Meenu genuinely cares about every student's progress."
    },
    {
      id: 3,
      name: "Yuki Tanaka",
      country: "Japan",
      rating: 5,
      course: "Exam Crash Course",
      text: "The mock exams and examiner insights were game-changers. I improved my TestDaF score enough to secure my university admission in Berlin!"
    },
    {
      id: 4,
      name: "Sarah O'Connor",
      country: "Ireland",
      rating: 4,
      course: "B2 Upper-Intermediate",
      text: "Excellent professional vocabulary training. I now work at a German company in Frankfurt and use what Meenu taught me every single day."
    },
    {
      id: 5,
      name: "Ahmed Hassan",
      country: "Egypt",
      rating: 5,
      course: "One-on-One Consultation",
      text: "The 90-minute relocation prep session was worth every cent. Meenu reviewed my CV, practiced interview questions with me, and I got the job in Munich!"
    },
    {
      id: 6,
      name: "Elena Petrova",
      country: "Russia",
      rating: 5,
      course: "German for Kids",
      text: "My 10-year-old daughter looks forward to every class. Meenu makes learning German feel like playtime while ensuring real progress."
    }
  ],

  testimonials: [
    {
      id: 1,
      name: "Dr. Rajesh Kumar",
      role: "Physician, now working in Hamburg",
      text: "Meenu's medical German preparation helped me clear the FachsprachprÃ¼fung. Her dedication to student success is unmatched. I owe my career in Germany to her training.",
      photo: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=200&q=80"
    },
    {
      id: 2,
      name: "Maria Gonzalez",
      role: "Masters Student, TU MÃ¼nchen",
      text: "I went from A2 to C1 in 18 months with Meenu. She didn't just teach me German â€” she prepared me for life in Germany. Best investment I ever made.",
      photo: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80"
    },
    {
      id: 3,
      name: "James Wilson",
      role: "Software Engineer, Berlin",
      text: "As a busy professional, I needed flexible, efficient learning. Meenu's structured approach and evening classes fit perfectly. Passed B2 while working full-time!",
      photo: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&q=80"
    }
  ],

  videos: [
    {
      id: 1,
      title: "German A1 Full Course â€” Lesson 1: Greetings",
      description: "Start learning German today with this free introductory lesson covering essential greetings and introductions.",
      youtubeId: "9mNTcCwzHFc",
      thumbnail: "https://img.youtube.com/vi/9mNTcCwzHFc/hqdefault.jpg"
    },
    {
      id: 2,
      title: "Top 10 German Grammar Mistakes (and How to Fix Them)",
      description: "Avoid the most common mistakes learners make with der/die/das, cases and word order.",
      youtubeId: "0Nrb1oRXBjM",
      thumbnail: "https://img.youtube.com/vi/0Nrb1oRXBjM/hqdefault.jpg"
    },
    {
      id: 3,
      title: "Goethe B1 Speaking Exam â€” Full Simulation",
      description: "Watch a complete mock speaking exam with commentary on scoring criteria and pro tips.",
      youtubeId: "vNzxeVwjYWU",
      thumbnail: "https://img.youtube.com/vi/vNzxeVwjYWU/hqdefault.jpg"
    }
  ],

  gallery: [
    {
      id: 1,
      title: "Online class in action",
      url: "https://images.unsplash.com/photo-1587560699334-cc4ff634909a?w=800&q=80"
    },
    {
      id: 2,
      title: "Student workshop in Munich",
      url: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=800&q=80"
    },
    {
      id: 3,
      title: "Brandenburg Gate study trip",
      url: "https://images.unsplash.com/photo-1560930950-5cc20e80e392?w=800&q=80"
    },
    {
      id: 4,
      title: "Certificate ceremony",
      url: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=800&q=80"
    },
    {
      id: 5,
      title: "Neuschwanstein cultural excursion",
      url: "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=800&q=80"
    },
    {
      id: 6,
      title: "Group conversation practice",
      url: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&q=80"
    }
  ]
};

export default siteData;

