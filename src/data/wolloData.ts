export const DEFAULT_TELEGRAM_LINK = 'https://t.me/+GlchgXPze01lN2I0';

export const DEFAULT_ADMIN_CREDENTIALS = {
  name: 'Platform Administrator',
  email: '',
  password: '',
  role: 'Super Admin',
};

export interface CourseLesson {
  id: string;
  title: string;
  duration: string;
  summary: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  categoryBadge: 'STEM' | 'Language' | 'Entrance Prep';
  department: string;
  level: string; // e.g. 'University Freshman', 'University 2nd Year', 'Open to All Learners'
  priceEtb: number; // Assigned by Admin (0 = Free, >0 = Paid Enrollment)
  instructor: string;
  thumbnailUrl: string;
  enrolledCount: number;
  lessons: CourseLesson[];
}

export interface SharedMaterial {
  id: string;
  title: string;
  description: string;
  category: string;
  level: string;
  format: 'PDF' | 'DOCX' | 'PPTX';
  fileSizeMb: number;
  uploadedBy: string;
  uploaderRole: 'University Student' | 'Lecturer' | 'Admin' | 'Learner';
  downloadCount: number;
  createdAt: string;
  previewText: string;
}

export interface ContactEnrollmentRequest {
  id: string;
  studentName: string;
  studentContact: string;
  courseId?: string;
  courseTitle: string;
  priceEtb: number;
  message: string;
  createdAt: string;
  status: 'New Request' | 'Enrolled';
}

export const INITIAL_MATERIAL_CATEGORIES: string[] = [
  'Freshman University',
  'Computer Science & IT',
  'Engineering & Technology',
  'Business & Economics',
  'Health & Medical Sciences',
  'Natural Sciences & Math',
  'Languages & Communication',
];

export const INITIAL_COURSES: Course[] = [
  {
    id: 'course-calc-uni',
    title: 'Applied Mathematics I & II: Calculus & Linear Algebra',
    description:
      'Complete university course covering limits, multivariable derivatives, Riemann integration, matrices, and engineering problem sets.',
    categoryBadge: 'STEM',
    department: 'Mathematics & Engineering',
    level: 'University Freshman & 2nd Year',
    priceEtb: 350,
    instructor: 'Ato Dawit Gebremedhin (Wollo University)',
    thumbnailUrl: '/src/assets/images/course_math_calculus_1791700847958.jpg',
    enrolledCount: 640,
    lessons: [
      {
        id: 'l-calc-1',
        title: '1. Limits, Continuity & Tangent Derivatives',
        duration: '45 min',
        summary: 'Formal epsilon-delta limits, chain rule derivatives, and tangent line approximations.',
      },
      {
        id: 'l-calc-2',
        title: '2. Definite Integrals, Riemann Sums & Applications',
        duration: '50 min',
        summary: 'Integration by parts, partial fractions, and area/volume of revolution.',
      },
      {
        id: 'l-calc-3',
        title: '3. Systems of Linear Equations & Eigenvalues',
        duration: '55 min',
        summary: 'Gaussian elimination, matrix determinants, vector spaces, and eigenvalues.',
      },
    ],
  },
  {
    id: 'course-phys-uni',
    title: 'General Physics & Electromagnetism for University & College',
    description:
      'Structured lectures and laboratory problem walkthroughs on mechanics, magnetic flux, solenoids, AC circuits, and wave interference.',
    categoryBadge: 'STEM',
    department: 'Physics & Electrical Engineering',
    level: 'University & College Learners',
    priceEtb: 300,
    instructor: 'Dr. Mekonnen Tadesse',
    thumbnailUrl: '/src/assets/images/course_physics_mechanics_1791700824964.jpg',
    enrolledCount: 820,
    lessons: [
      {
        id: 'l-phys-1',
        title: '1. Electrostatics, Gauss Law & Capacitance',
        duration: '40 min',
        summary: 'Electric field lines, flux calculations, and parallel-plate dielectrics.',
      },
      {
        id: 'l-phys-2',
        title: '2. Solenoid Magnetic Fields & Faraday Induction',
        duration: '45 min',
        summary: 'Calculating B = μ₀nI, Lenz law, and transformer power transmission.',
      },
    ],
  },
  {
    id: 'course-comm-eng',
    title: 'Communicative English & Academic Research Writing',
    description:
      'Essential university course on academic essay writing, research citations, reading comprehension, and professional presentation skills.',
    categoryBadge: 'Language',
    department: 'Languages & Humanities',
    level: 'All University & Independent Learners',
    priceEtb: 200,
    instructor: 'Dr. Hiwot Alemayehu',
    thumbnailUrl: '/src/assets/images/hero_wollo_students_1791700811761.jpg',
    enrolledCount: 950,
    lessons: [
      {
        id: 'l-eng-1',
        title: '1. Academic Reading Strategies & Discourse Markers',
        duration: '35 min',
        summary: 'Analyzing complex university journal articles and logical transitions.',
      },
      {
        id: 'l-eng-2',
        title: '2. Research Paper Structure & APA Referencing',
        duration: '45 min',
        summary: 'Writing thesis statements, literature reviews, and proper academic citations.',
      },
    ],
  },
  {
    id: 'course-chem-bio',
    title: 'General Biology, Biochemistry & Electrochemistry Foundations',
    description:
      'Comprehensive course for pre-medical, health science, and natural science students covering cellular genetics, Bohr effect, and galvanic cells.',
    categoryBadge: 'Entrance Prep',
    department: 'Natural & Health Sciences',
    level: 'University Freshman & Entrance Prep',
    priceEtb: 250,
    instructor: 'Prof. Selamawit Bekele',
    thumbnailUrl: '/src/assets/images/course_biology_genetics_1791700836013.jpg',
    enrolledCount: 530,
    lessons: [
      {
        id: 'l-bio-1',
        title: '1. Molecular Genetics, DNA Replication & ATP Synthesis',
        duration: '45 min',
        summary: 'Chargaff base-pairing rules, transcription, translation, and oxidative phosphorylation.',
      },
      {
        id: 'l-bio-2',
        title: '2. Electrochemistry, Redox Potentials & The Nernst Equation',
        duration: '50 min',
        summary: 'Daniell galvanic cells, standard electrode potentials, and biological pH buffers.',
      },
    ],
  },
];

export const INITIAL_SHARED_MATERIALS: SharedMaterial[] = [
  {
    id: 'mat-1',
    title: 'Ethiopian University Freshman Course Pack: Logic, Critical Thinking & Psychology',
    description:
      'Complete 42-page lecture handout and midterm/final exam compilation for all first-year university students.',
    category: 'Freshman University',
    level: '1st Year University',
    format: 'PDF',
    fileSizeMb: 2.4,
    uploadedBy: 'Kaleb Yesuf (Wollo University)',
    uploaderRole: 'University Student',
    downloadCount: 3420,
    createdAt: '2 days ago',
    previewText:
      'Covers Chapter 1–5 of Logic & Critical Thinking: deductive vs inductive arguments, formal and informal fallacies, and cognitive psychology foundations.',
  },
  {
    id: 'mat-2',
    title: 'C++ & Python Programming Fundamentals: Lab Manual & Solved Exercises',
    description:
      'Practical coding guide with 60 solved university lab problems covering loops, arrays, pointers, functions, and data structures.',
    category: 'Computer Science & IT',
    level: 'University 1st & 2nd Year',
    format: 'PDF',
    fileSizeMb: 1.8,
    uploadedBy: 'Biniyam Tsegaye (CS Dept)',
    uploaderRole: 'University Student',
    downloadCount: 2890,
    createdAt: '4 days ago',
    previewText:
      'Includes step-by-step trace tables, sorting algorithms (merge sort, quick sort), and object-oriented programming examples.',
  },
  {
    id: 'mat-3',
    title: 'Applied Engineering Mechanics: Statics & Dynamics Formula Sheet + Solved Finals',
    description:
      'Free reference manual for Kombolcha Institute of Technology (KIoT) and engineering students covering trusses, centroids, and kinematics.',
    category: 'Engineering & Technology',
    level: 'Engineering 2nd Year',
    format: 'PDF',
    fileSizeMb: 3.1,
    uploadedBy: 'Dr. Mekonnen Tadesse',
    uploaderRole: 'Lecturer',
    downloadCount: 2150,
    createdAt: '5 days ago',
    previewText:
      'Free-body diagrams, method of joints and sections for trusses, moment of inertia integrals, and work-energy equations.',
  },
  {
    id: 'mat-4',
    title: 'Principles of Microeconomics & Financial Accounting Summary Slides',
    description:
      'Clean slide deck covering supply-demand elasticity, market structures, balance sheets, and double-entry bookkeeping.',
    category: 'Business & Economics',
    level: 'University & College',
    format: 'PPTX',
    fileSizeMb: 2.2,
    uploadedBy: 'Meron Assefa (Economics)',
    uploaderRole: 'University Student',
    downloadCount: 1640,
    createdAt: '1 week ago',
    previewText:
      'Includes worked numerical examples for price elasticity of demand, marginal revenue vs marginal cost, and trial balance preparation.',
  },
  {
    id: 'mat-5',
    title: 'Human Anatomy, Physiology & Biochemistry Illustrated Study Notes',
    description:
      'High-yield summary notes on cardiovascular oxygen transport (Bohr effect), cellular metabolism, and enzyme kinetics.',
    category: 'Health & Medical Sciences',
    level: 'Health Science & Pre-Med',
    format: 'PDF',
    fileSizeMb: 2.9,
    uploadedBy: 'Prof. Selamawit Bekele',
    uploaderRole: 'Lecturer',
    downloadCount: 1980,
    createdAt: '1 week ago',
    previewText:
      'Detailed diagrams of hemoglobin dissociation curves, Michaelis-Menten enzyme kinetics, and renal acid-base balance.',
  },
  {
    id: 'mat-6',
    title: 'Communicative English Skills I & II: Grammar, Essay Writing & Exam Guide',
    description:
      'Open study material for university freshman and entrance learners covering academic paragraph structure and conditional grammar.',
    category: 'Languages & Communication',
    level: 'All Learners',
    format: 'DOCX',
    fileSizeMb: 1.3,
    uploadedBy: 'Dr. Hiwot Alemayehu',
    uploaderRole: 'Lecturer',
    downloadCount: 2510,
    createdAt: '2 weeks ago',
    previewText:
      'Includes 100 solved grammar and sentence completion items, transition word tables, and sample argumentative essays.',
  },
];

export const INITIAL_CONTACT_REQUESTS: ContactEnrollmentRequest[] = [
  {
    id: 'req-1',
    studentName: 'Yared Alemu',
    studentContact: '@yared_alemu / +251 912 345 678',
    courseId: 'course-calc-uni',
    courseTitle: 'Applied Mathematics I & II: Calculus & Linear Algebra',
    priceEtb: 350,
    message: 'I want to enroll in Applied Mathematics I & II: Calculus & Linear Algebra (350 ETB). Please contact me.',
    createdAt: 'Today, 10:15 AM',
    status: 'New Request',
  },
];
