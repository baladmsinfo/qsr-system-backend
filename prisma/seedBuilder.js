/**
 * Website Builder seed - system Themes + starter Templates.
 * Safe to re-run: upserts by name (Theme/Template don't have a natural
 * unique business key in the schema, so this deletes-then-recreates the
 * `isSystem: true` rows only, never touching a tenant's own Website/Page data).
 *
 * Usage:
 *   node prisma/seedBuilder.js
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const THEMES = [
  {
    name: "Bucksbox Violet",
    colors: { primary: "#6D28D9", secondary: "#6B6478", accent: "#F59E0B", background: "#FAFAFC", text: "#1F2937" },
    fontHeading: "Manrope",
    fontBody: "Inter",
  },
  {
    name: "Warm Kitchen",
    colors: { primary: "#B45309", secondary: "#78716C", accent: "#DC2626", background: "#FFFBEB", text: "#292524" },
    fontHeading: "Manrope",
    fontBody: "Inter",
  },
  {
    name: "Neutral Slate",
    colors: { primary: "#0F172A", secondary: "#475569", accent: "#0EA5E9", background: "#F8FAFC", text: "#0F172A" },
    fontHeading: "Manrope",
    fontBody: "Inter",
  },
];

function navbar(overrides = {}) {
  return {
    type: "Navbar",
    props: {
      logoText: "Your Restaurant",
      logoImageUrl: "",
      links: [
        { label: "Home", href: "#home" },
        { label: "Menu", href: "#menu" },
        { label: "About", href: "#about" },
        { label: "Contact", href: "#contact" },
      ],
      ctaLabel: "Order Now",
      ctaLink: "#menu",
      ...overrides,
    },
  };
}

function footer(overrides = {}) {
  return {
    type: "Footer",
    props: {
      logoText: "Your Restaurant",
      tagline: "Freshly made, every day.",
      links: [
        { label: "Menu", href: "#menu" },
        { label: "Contact", href: "#contact" },
      ],
      socialLinks: [
        { icon: "mdi-instagram", href: "#" },
        { icon: "mdi-facebook", href: "#" },
      ],
      copyrightText: `© ${new Date().getFullYear()} Your Restaurant. All rights reserved.`,
      ...overrides,
    },
  };
}

const TEMPLATES = [
  {
    name: "Restaurant",
    category: "Restaurant",
    blocks: {
      blocks: [
        navbar(),
        {
          type: "Hero",
          props: {
            tag: "Welcome to",
            headline: "Authentic Flavors, Made Fresh Daily",
            subtext: "Dine in, takeaway or order online - real ingredients, real recipes.",
            imageUrl: "",
            ctaLabel: "View Menu",
            ctaLink: "#menu",
            align: "left",
          },
        },
        {
          type: "Features",
          props: {
            title: "Why Dine With Us",
            subtitle: "",
            items: [
              { icon: "mdi-chef-hat", title: "Freshly Prepared", body: "Every dish cooked to order." },
              { icon: "mdi-leaf", title: "Quality Ingredients", body: "Sourced daily from trusted suppliers." },
              { icon: "mdi-clock-fast", title: "Quick Service", body: "Fast without cutting corners." },
            ],
          },
        },
        {
          type: "RestaurantMenu",
          props: {
            title: "Our Menu",
            subtitle: "A taste of our favorites",
            categories: [
              {
                name: "Starters",
                items: [
                  { name: "Paneer Tikka", description: "Marinated cottage cheese, char-grilled.", price: "220", imageUrl: "" },
                  { name: "Spring Rolls", description: "Crispy vegetable rolls.", price: "180", imageUrl: "" },
                ],
              },
              {
                name: "Mains",
                items: [
                  { name: "Butter Chicken", description: "Slow-cooked in a rich tomato gravy.", price: "340", imageUrl: "" },
                  { name: "Veg Biryani", description: "Fragrant basmati rice, seasonal vegetables.", price: "280", imageUrl: "" },
                ],
              },
            ],
          },
        },
        {
          type: "Gallery",
          props: {
            title: "Inside Our Kitchen",
            images: [
              { url: "", caption: "" },
              { url: "", caption: "" },
              { url: "", caption: "" },
            ],
          },
        },
        {
          type: "Testimonials",
          props: {
            title: "What Guests Say",
            items: [
              { quote: "Best butter chicken in town!", author: "Rahul S.", role: "Regular guest" },
              { quote: "Great ambience and quick service.", author: "Priya M.", role: "Google review" },
            ],
          },
        },
        {
          type: "Faq",
          props: {
            title: "Frequently Asked Questions",
            items: [
              { question: "Do you take table reservations?", answer: "Yes, call us or book via the contact section." },
              { question: "Is home delivery available?", answer: "Yes, through our online ordering." },
            ],
          },
        },
        {
          type: "Cta",
          props: {
            title: "Hungry Already?",
            subtitle: "Order online and get it delivered fresh and hot.",
            ctaLabel: "Order Now",
            ctaLink: "#menu",
            background: "primary",
          },
        },
        {
          type: "Contact",
          props: {
            title: "Visit Us",
            subtitle: "We'd love to have you.",
            address: "123 Main Street, Your City",
            phone: "+91 90000 00000",
            email: "hello@yourrestaurant.com",
            mapEmbedUrl: "",
          },
        },
        footer(),
      ],
    },
  },
  {
    name: "Cafe",
    category: "Cafe",
    blocks: {
      blocks: [
        navbar({ logoText: "Your Cafe", ctaLabel: "See Menu" }),
        {
          type: "Hero",
          props: {
            tag: "Your neighborhood",
            headline: "Coffee, Conversations & Comfort",
            subtext: "Freshly roasted coffee and all-day breakfast.",
            imageUrl: "",
            ctaLabel: "See Coffee Menu",
            ctaLink: "#menu",
            align: "center",
          },
        },
        {
          type: "RestaurantMenu",
          props: {
            title: "Coffee & Bites",
            subtitle: "",
            categories: [
              {
                name: "Coffee",
                items: [
                  { name: "Cappuccino", description: "Rich espresso, steamed milk foam.", price: "150", imageUrl: "" },
                  { name: "Cold Brew", description: "Slow-steeped, smooth and bold.", price: "170", imageUrl: "" },
                ],
              },
              {
                name: "Bakery",
                items: [
                  { name: "Croissant", description: "Buttery, flaky, baked fresh.", price: "120", imageUrl: "" },
                ],
              },
            ],
          },
        },
        {
          type: "Gallery",
          props: { title: "Our Space", images: [{ url: "", caption: "" }, { url: "", caption: "" }] },
        },
        {
          type: "Testimonials",
          props: {
            title: "Loved By Regulars",
            items: [{ quote: "My favorite spot to work from.", author: "Ananya K.", role: "Regular guest" }],
          },
        },
        {
          type: "Contact",
          props: {
            title: "Find Us",
            subtitle: "",
            address: "45 Cafe Lane, Your City",
            phone: "+91 90000 00001",
            email: "hello@yourcafe.com",
            mapEmbedUrl: "",
          },
        },
        footer({ logoText: "Your Cafe", tagline: "Small batch, big flavor." }),
      ],
    },
  },
  {
    name: "Business",
    category: "Business",
    blocks: {
      blocks: [
        navbar({ logoText: "Your Business", links: [
          { label: "Home", href: "#home" },
          { label: "Services", href: "#features" },
          { label: "Contact", href: "#contact" },
        ], ctaLabel: "Get in Touch" }),
        {
          type: "Hero",
          props: {
            tag: "Trusted since day one",
            headline: "Solutions Built Around Your Business",
            subtext: "We help you move faster with less friction.",
            imageUrl: "",
            ctaLabel: "Get in Touch",
            ctaLink: "#contact",
            align: "left",
          },
        },
        {
          type: "Features",
          props: {
            title: "What We Do",
            subtitle: "",
            items: [
              { icon: "mdi-briefcase", title: "Consulting", body: "Strategic guidance for growth." },
              { icon: "mdi-cog", title: "Operations", body: "Streamlined day-to-day execution." },
              { icon: "mdi-headset", title: "Support", body: "We're here whenever you need us." },
            ],
          },
        },
        {
          type: "Testimonials",
          props: { title: "Client Feedback", items: [{ quote: "Reliable and responsive team.", author: "Client Name", role: "Company" }] },
        },
        {
          type: "Faq",
          props: { title: "FAQs", items: [{ question: "How do we get started?", answer: "Reach out via the contact form below." }] },
        },
        {
          type: "Cta",
          props: { title: "Ready to talk?", subtitle: "Let's discuss how we can help.", ctaLabel: "Contact Us", ctaLink: "#contact", background: "dark" },
        },
        {
          type: "Contact",
          props: { title: "Get in Touch", subtitle: "", address: "Your Office Address", phone: "+91 90000 00002", email: "hello@yourbusiness.com", mapEmbedUrl: "" },
        },
        footer({ logoText: "Your Business", tagline: "" }),
      ],
    },
  },
  {
    name: "Landing Page",
    category: "Landing",
    blocks: {
      blocks: [
        navbar({ logoText: "Your Brand", links: [{ label: "Features", href: "#features" }, { label: "FAQ", href: "#faq" }], ctaLabel: "Get Started" }),
        {
          type: "Hero",
          props: {
            tag: "New",
            headline: "Launch Your Idea, Today",
            subtext: "A simple, focused landing page to get you moving.",
            imageUrl: "",
            ctaLabel: "Get Started",
            ctaLink: "#contact",
            align: "center",
          },
        },
        {
          type: "Features",
          props: {
            title: "Highlights",
            subtitle: "",
            items: [
              { icon: "mdi-flash", title: "Fast", body: "Get up and running quickly." },
              { icon: "mdi-shield-check", title: "Reliable", body: "Built to last." },
              { icon: "mdi-heart", title: "Simple", body: "No unnecessary complexity." },
            ],
          },
        },
        { type: "Faq", props: { title: "FAQ", items: [{ question: "How does this work?", answer: "Edit this page from the builder." }] } },
        { type: "Cta", props: { title: "Get Started Today", subtitle: "", ctaLabel: "Get Started", ctaLink: "#contact", background: "primary" } },
        { type: "Contact", props: { title: "Contact", subtitle: "", address: "", phone: "", email: "hello@yourbrand.com", mapEmbedUrl: "" } },
        footer({ logoText: "Your Brand", tagline: "" }),
      ],
    },
  },
  {
    name: "Hotel",
    category: "Hotel",
    blocks: {
      blocks: [
        navbar({ logoText: "Your Hotel", links: [{ label: "Rooms", href: "#pricing" }, { label: "Gallery", href: "#gallery" }, { label: "Contact", href: "#contact" }], ctaLabel: "Book Now" }),
        { type: "Hero", props: { tag: "Welcome to", headline: "A Stay to Remember", subtext: "Comfortable rooms, warm hospitality, unforgettable moments.", imageUrl: "", ctaLabel: "Book Now", ctaLink: "#pricing", align: "left" } },
        { type: "Features", props: { title: "Hotel Amenities", subtitle: "", items: [
          { icon: "mdi-wifi", title: "Free Wi-Fi", body: "Stay connected throughout your stay." },
          { icon: "mdi-pool", title: "Swimming Pool", body: "Relax by the pool any time of day." },
          { icon: "mdi-silverware-fork-knife", title: "In-house Dining", body: "Multi-cuisine restaurant on-site." },
        ] } },
        { type: "Gallery", props: { title: "Our Rooms & Spaces", images: [{ url: "", caption: "" }, { url: "", caption: "" }, { url: "", caption: "" }] } },
        { type: "Pricing", props: { title: "Room Rates", subtitle: "", plans: [
          { name: "Standard Room", price: "₹3,500", period: "night", features: [{ value: "Queen bed" }, { value: "Free Wi-Fi" }], ctaLabel: "Book Now", ctaLink: "#contact", highlighted: false },
          { name: "Deluxe Room", price: "₹5,500", period: "night", features: [{ value: "King bed" }, { value: "City view" }, { value: "Breakfast included" }], ctaLabel: "Book Now", ctaLink: "#contact", highlighted: true },
        ] } },
        { type: "Testimonials", props: { title: "Guest Reviews", items: [{ quote: "Wonderful stay, attentive staff.", author: "Guest", role: "Verified stay" }] } },
        { type: "Map", props: { title: "Getting Here", subtitle: "", address: "Your Hotel Address", mapEmbedUrl: "" } },
        { type: "Contact", props: { title: "Reservations", subtitle: "", address: "Your Hotel Address", phone: "+91 90000 00003", email: "reservations@yourhotel.com", mapEmbedUrl: "" } },
        footer({ logoText: "Your Hotel", tagline: "Comfort, wherever you rest." }),
      ],
    },
  },
  {
    name: "Salon",
    category: "Salon",
    blocks: {
      blocks: [
        navbar({ logoText: "Your Salon", links: [{ label: "Services", href: "#features" }, { label: "Pricing", href: "#pricing" }, { label: "Contact", href: "#contact" }], ctaLabel: "Book Appointment" }),
        { type: "Hero", props: { tag: "Look & feel your best", headline: "Beauty, Redefined", subtext: "Expert stylists, premium products, relaxing ambience.", imageUrl: "", ctaLabel: "Book Appointment", ctaLink: "#contact", align: "center" } },
        { type: "Cards", props: { title: "Our Services", subtitle: "", cards: [
          { title: "Hair Styling", body: "Cuts, color, and styling for every occasion.", imageUrl: "", link: "" },
          { title: "Skin Care", body: "Facials and treatments tailored to your skin.", imageUrl: "", link: "" },
          { title: "Spa & Massage", body: "Unwind with our relaxing spa therapies.", imageUrl: "", link: "" },
        ] } },
        { type: "Team", props: { title: "Meet Our Stylists", subtitle: "", members: [{ name: "Stylist Name", role: "Senior Stylist", photoUrl: "", bio: "" }] } },
        { type: "Pricing", props: { title: "Service Pricing", subtitle: "", plans: [
          { name: "Haircut", price: "₹499", period: "session", features: [{ value: "Wash & style included" }], ctaLabel: "Book Now", ctaLink: "#contact", highlighted: false },
          { name: "Full Package", price: "₹2,499", period: "session", features: [{ value: "Hair, skin & spa" }, { value: "Complimentary refreshments" }], ctaLabel: "Book Now", ctaLink: "#contact", highlighted: true },
        ] } },
        { type: "Testimonials", props: { title: "What Clients Say", items: [{ quote: "Always leave feeling refreshed!", author: "Client", role: "Regular guest" }] } },
        { type: "Contact", props: { title: "Book Your Visit", subtitle: "", address: "Your Salon Address", phone: "+91 90000 00004", email: "hello@yoursalon.com", mapEmbedUrl: "" } },
        footer({ logoText: "Your Salon", tagline: "Beauty, redefined." }),
      ],
    },
  },
  {
    name: "Gym",
    category: "Gym",
    blocks: {
      blocks: [
        navbar({ logoText: "Your Gym", links: [{ label: "Programs", href: "#features" }, { label: "Membership", href: "#pricing" }, { label: "Contact", href: "#contact" }], ctaLabel: "Join Now" }),
        { type: "Hero", props: { tag: "Train harder", headline: "Build The Best Version Of You", subtext: "Modern equipment, expert trainers, real results.", imageUrl: "", ctaLabel: "Join Now", ctaLink: "#pricing", align: "left" } },
        { type: "Statistics", props: { title: "", subtitle: "", stats: [
          { value: "1000+", label: "Active Members" }, { value: "15", label: "Expert Trainers" }, { value: "20+", label: "Weekly Classes" }, { value: "24/7", label: "Access" },
        ] } },
        { type: "Features", props: { title: "Our Programs", subtitle: "", items: [
          { icon: "mdi-weight-lifter", title: "Strength Training", body: "Build muscle with guided programs." },
          { icon: "mdi-run", title: "Cardio & HIIT", body: "High-energy classes to burn fat fast." },
          { icon: "mdi-yoga", title: "Yoga & Recovery", body: "Improve flexibility and recover right." },
        ] } },
        { type: "Pricing", props: { title: "Membership Plans", subtitle: "", plans: [
          { name: "Monthly", price: "₹1,499", period: "mo", features: [{ value: "Full gym access" }], ctaLabel: "Join Now", ctaLink: "#contact", highlighted: false },
          { name: "Annual", price: "₹12,999", period: "yr", features: [{ value: "Full gym access" }, { value: "2 free PT sessions/mo" }], ctaLabel: "Join Now", ctaLink: "#contact", highlighted: true },
        ] } },
        { type: "Team", props: { title: "Our Trainers", subtitle: "", members: [{ name: "Trainer Name", role: "Head Coach", photoUrl: "", bio: "" }] } },
        { type: "Contact", props: { title: "Visit The Gym", subtitle: "", address: "Your Gym Address", phone: "+91 90000 00005", email: "hello@yourgym.com", mapEmbedUrl: "" } },
        footer({ logoText: "Your Gym", tagline: "Stronger every day." }),
      ],
    },
  },
  {
    name: "Medical",
    category: "Medical",
    blocks: {
      blocks: [
        navbar({ logoText: "Your Clinic", links: [{ label: "Services", href: "#features" }, { label: "Doctors", href: "#team" }, { label: "Contact", href: "#contact" }], ctaLabel: "Book Appointment" }),
        { type: "Hero", props: { tag: "Your health, our priority", headline: "Compassionate Care You Can Trust", subtext: "Modern diagnostics and experienced doctors under one roof.", imageUrl: "", ctaLabel: "Book Appointment", ctaLink: "#contact", align: "left" } },
        { type: "Features", props: { title: "Our Services", subtitle: "", items: [
          { icon: "mdi-stethoscope", title: "General Consultation", body: "Comprehensive checkups for the whole family." },
          { icon: "mdi-pill", title: "Pharmacy", body: "In-house pharmacy for your convenience." },
          { icon: "mdi-ambulance", title: "Emergency Care", body: "Round-the-clock emergency support." },
        ] } },
        { type: "Team", props: { title: "Our Doctors", subtitle: "", members: [{ name: "Dr. Name", role: "Specialist", photoUrl: "", bio: "" }] } },
        { type: "Testimonials", props: { title: "Patient Stories", items: [{ quote: "Caring staff and quick diagnosis.", author: "Patient", role: "Verified visit" }] } },
        { type: "Faq", props: { title: "Frequently Asked Questions", items: [{ question: "Do you accept insurance?", answer: "Yes, most major insurance providers are accepted." }] } },
        { type: "Map", props: { title: "Find Our Clinic", subtitle: "", address: "Your Clinic Address", mapEmbedUrl: "" } },
        { type: "Contact", props: { title: "Book an Appointment", subtitle: "", address: "Your Clinic Address", phone: "+91 90000 00006", email: "care@yourclinic.com", mapEmbedUrl: "" } },
        footer({ logoText: "Your Clinic", tagline: "Compassionate care, always." }),
      ],
    },
  },
  {
    name: "Agency",
    category: "Agency",
    blocks: {
      blocks: [
        navbar({ logoText: "Your Agency", links: [{ label: "Work", href: "#portfolio" }, { label: "Services", href: "#features" }, { label: "Contact", href: "#contact" }], ctaLabel: "Start a Project" }),
        { type: "Hero", props: { tag: "Creative studio", headline: "We Build Brands That Stand Out", subtext: "Strategy, design, and marketing that moves the needle.", imageUrl: "", ctaLabel: "Start a Project", ctaLink: "#contact", align: "left" } },
        { type: "Features", props: { title: "What We Do", subtitle: "", items: [
          { icon: "mdi-palette", title: "Branding", body: "Identity systems that make an impression." },
          { icon: "mdi-monitor-cellphone", title: "Web & Product", body: "Digital experiences people love using." },
          { icon: "mdi-bullhorn", title: "Marketing", body: "Campaigns that reach the right audience." },
        ] } },
        { type: "Portfolio", props: { title: "Selected Work", subtitle: "", items: [{ title: "Project Name", category: "Branding", imageUrl: "", link: "#" }] } },
        { type: "Statistics", props: { title: "", subtitle: "", stats: [
          { value: "120+", label: "Projects Delivered" }, { value: "45", label: "Happy Clients" }, { value: "8", label: "Years of Experience" }, { value: "12", label: "Awards Won" },
        ] } },
        { type: "Team", props: { title: "The Team", subtitle: "", members: [{ name: "Team Member", role: "Creative Director", photoUrl: "", bio: "" }] } },
        { type: "Testimonials", props: { title: "Client Feedback", items: [{ quote: "They transformed our brand completely.", author: "Client Name", role: "Company" }] } },
        { type: "Cta", props: { title: "Got a project in mind?", subtitle: "Let's create something great together.", ctaLabel: "Get in Touch", ctaLink: "#contact", background: "dark" } },
        { type: "Contact", props: { title: "Start a Conversation", subtitle: "", address: "Your Studio Address", phone: "+91 90000 00007", email: "hello@youragency.com", mapEmbedUrl: "" } },
        footer({ logoText: "Your Agency", tagline: "Ideas, crafted well." }),
      ],
    },
  },
  {
    name: "Portfolio",
    category: "Portfolio",
    blocks: {
      blocks: [
        navbar({ logoText: "Your Name", links: [{ label: "Work", href: "#portfolio" }, { label: "Contact", href: "#contact" }], ctaLabel: "Hire Me" }),
        { type: "Hero", props: { tag: "Hi, I'm", headline: "A Designer & Creator", subtext: "I craft thoughtful digital experiences.", imageUrl: "", ctaLabel: "View Work", ctaLink: "#portfolio", align: "center" } },
        { type: "Portfolio", props: { title: "Selected Work", subtitle: "", items: [{ title: "Project Name", category: "Design", imageUrl: "", link: "#" }] } },
        { type: "ImageGrid", props: { title: "Snapshots", columns: "4", images: [{ url: "" }, { url: "" }, { url: "" }, { url: "" }] } },
        { type: "Testimonials", props: { title: "Kind Words", items: [{ quote: "A pleasure to work with, great eye for detail.", author: "Collaborator", role: "" }] } },
        { type: "Contact", props: { title: "Let's Work Together", subtitle: "", address: "", phone: "", email: "hello@yourname.com", mapEmbedUrl: "" } },
        footer({ logoText: "Your Name", tagline: "" }),
      ],
    },
  },
  {
    name: "Startup",
    category: "Startup",
    blocks: {
      blocks: [
        navbar({ logoText: "Your Startup", links: [{ label: "Features", href: "#features" }, { label: "Pricing", href: "#pricing" }, { label: "FAQ", href: "#faq" }], ctaLabel: "Get Started" }),
        { type: "Hero", props: { tag: "Introducing", headline: "The Smarter Way to Work", subtext: "One platform to plan, build, and ship faster.", imageUrl: "", ctaLabel: "Get Started Free", ctaLink: "#pricing", align: "left" } },
        { type: "Statistics", props: { title: "", subtitle: "", stats: [
          { value: "10k+", label: "Active Users" }, { value: "99.9%", label: "Uptime" }, { value: "4.9/5", label: "Average Rating" }, { value: "24/7", label: "Support" },
        ] } },
        { type: "Features", props: { title: "Everything You Need", subtitle: "", items: [
          { icon: "mdi-rocket-launch", title: "Fast Setup", body: "Get started in minutes, not days." },
          { icon: "mdi-lock", title: "Secure by Default", body: "Enterprise-grade security built in." },
          { icon: "mdi-chart-line", title: "Powerful Insights", body: "Understand what matters, instantly." },
        ] } },
        { type: "Pricing", props: { title: "Simple, Transparent Pricing", subtitle: "", plans: [
          { name: "Starter", price: "$0", period: "mo", features: [{ value: "Up to 3 projects" }], ctaLabel: "Start Free", ctaLink: "#", highlighted: false },
          { name: "Pro", price: "$29", period: "mo", features: [{ value: "Unlimited projects" }, { value: "Priority support" }], ctaLabel: "Start Free Trial", ctaLink: "#", highlighted: true },
        ] } },
        { type: "Team", props: { title: "Backed By a Great Team", subtitle: "", members: [{ name: "Founder Name", role: "Co-founder & CEO", photoUrl: "", bio: "" }] } },
        { type: "Newsletter", props: { title: "Stay in the loop", subtitle: "Product updates, no spam.", placeholder: "Enter your email", ctaLabel: "Subscribe" } },
        { type: "Faq", props: { title: "FAQ", items: [{ question: "Is there a free trial?", answer: "Yes, 14 days free, no credit card required." }] } },
        { type: "Contact", props: { title: "Questions?", subtitle: "", address: "", phone: "", email: "hello@yourstartup.com", mapEmbedUrl: "" } },
        footer({ logoText: "Your Startup", tagline: "" }),
      ],
    },
  },
  {
    name: "Education",
    category: "Education",
    blocks: {
      blocks: [
        navbar({ logoText: "Your Institute", links: [{ label: "Courses", href: "#features" }, { label: "Faculty", href: "#team" }, { label: "Contact", href: "#contact" }], ctaLabel: "Enroll Now" }),
        { type: "Hero", props: { tag: "Learn with us", headline: "Education That Opens Doors", subtext: "Practical courses taught by industry experts.", imageUrl: "", ctaLabel: "Enroll Now", ctaLink: "#contact", align: "left" } },
        { type: "Features", props: { title: "Popular Courses", subtitle: "", items: [
          { icon: "mdi-book-open-variant", title: "Foundational Course", body: "Build strong fundamentals from scratch." },
          { icon: "mdi-laptop", title: "Professional Track", body: "Career-focused, hands-on learning." },
          { icon: "mdi-certificate", title: "Certification", body: "Earn a recognized certificate on completion." },
        ] } },
        { type: "Cards", props: { title: "Why Choose Us", subtitle: "", cards: [{ title: "Expert Faculty", body: "Learn from experienced practitioners.", imageUrl: "", link: "" }] } },
        { type: "Team", props: { title: "Our Faculty", subtitle: "", members: [{ name: "Faculty Name", role: "Lead Instructor", photoUrl: "", bio: "" }] } },
        { type: "Statistics", props: { title: "", subtitle: "", stats: [
          { value: "5000+", label: "Students Trained" }, { value: "50+", label: "Courses" }, { value: "92%", label: "Placement Rate" }, { value: "15", label: "Years of Excellence" },
        ] } },
        { type: "Testimonials", props: { title: "Student Success Stories", items: [{ quote: "This course changed my career path.", author: "Alumni", role: "Graduate" }] } },
        { type: "Newsletter", props: { title: "Get Course Updates", subtitle: "New batches and offers in your inbox.", placeholder: "Enter your email", ctaLabel: "Subscribe" } },
        { type: "Contact", props: { title: "Have Questions?", subtitle: "", address: "Your Institute Address", phone: "+91 90000 00008", email: "admissions@yourinstitute.com", mapEmbedUrl: "" } },
        footer({ logoText: "Your Institute", tagline: "" }),
      ],
    },
  },
  {
    name: "Construction",
    category: "Construction",
    blocks: {
      blocks: [
        navbar({ logoText: "Your Construction Co.", links: [{ label: "Services", href: "#features" }, { label: "Projects", href: "#portfolio" }, { label: "Contact", href: "#contact" }], ctaLabel: "Get a Quote" }),
        { type: "Hero", props: { tag: "Building since day one", headline: "Solid Foundations, Lasting Structures", subtext: "Residential and commercial construction done right.", imageUrl: "", ctaLabel: "Get a Quote", ctaLink: "#contact", align: "left" } },
        { type: "Features", props: { title: "Our Services", subtitle: "", items: [
          { icon: "mdi-home-city", title: "Residential", body: "Custom homes built to your vision." },
          { icon: "mdi-office-building", title: "Commercial", body: "Reliable commercial construction projects." },
          { icon: "mdi-hammer-wrench", title: "Renovation", body: "Transforming existing spaces expertly." },
        ] } },
        { type: "Portfolio", props: { title: "Recent Projects", subtitle: "", items: [{ title: "Project Name", category: "Residential", imageUrl: "", link: "#" }] } },
        { type: "Statistics", props: { title: "", subtitle: "", stats: [
          { value: "200+", label: "Projects Completed" }, { value: "18", label: "Years in Business" }, { value: "100%", label: "On-Time Delivery" }, { value: "50+", label: "Skilled Workers" },
        ] } },
        { type: "Team", props: { title: "Our Team", subtitle: "", members: [{ name: "Team Member", role: "Site Engineer", photoUrl: "", bio: "" }] } },
        { type: "Testimonials", props: { title: "Client Reviews", items: [{ quote: "Delivered on time and on budget.", author: "Client Name", role: "Homeowner" }] } },
        { type: "Contact", props: { title: "Request a Quote", subtitle: "", address: "Your Office Address", phone: "+91 90000 00009", email: "info@yourconstructionco.com", mapEmbedUrl: "" } },
        footer({ logoText: "Your Construction Co.", tagline: "" }),
      ],
    },
  },
  {
    name: "Photography",
    category: "Photography",
    blocks: {
      blocks: [
        navbar({ logoText: "Your Studio", links: [{ label: "Portfolio", href: "#portfolio" }, { label: "Contact", href: "#contact" }], ctaLabel: "Book a Session" }),
        { type: "Hero", props: { tag: "Capturing moments", headline: "Photography That Tells Your Story", subtext: "Weddings, portraits, and events - beautifully captured.", imageUrl: "", ctaLabel: "Book a Session", ctaLink: "#contact", align: "center" } },
        { type: "Gallery", props: { title: "Featured Shots", images: [{ url: "", caption: "" }, { url: "", caption: "" }, { url: "", caption: "" }] } },
        { type: "Portfolio", props: { title: "Portfolio", subtitle: "", items: [{ title: "Session Name", category: "Wedding", imageUrl: "", link: "#" }] } },
        { type: "ImageGrid", props: { title: "Recent Work", columns: "4", images: [{ url: "" }, { url: "" }, { url: "" }, { url: "" }] } },
        { type: "Video", props: { title: "Behind the Lens", subtitle: "", videoUrl: "", posterUrl: "" } },
        { type: "Testimonials", props: { title: "Client Love", items: [{ quote: "Captured our day perfectly, stunning photos.", author: "Client", role: "Wedding client" }] } },
        { type: "Contact", props: { title: "Book Your Session", subtitle: "", address: "", phone: "+91 90000 00010", email: "hello@yourstudio.com", mapEmbedUrl: "" } },
        footer({ logoText: "Your Studio", tagline: "" }),
      ],
    },
  },
  {
    name: "Travel",
    category: "Travel",
    blocks: {
      blocks: [
        navbar({ logoText: "Your Travel Co.", links: [{ label: "Destinations", href: "#features" }, { label: "Gallery", href: "#gallery" }, { label: "Contact", href: "#contact" }], ctaLabel: "Plan a Trip" }),
        { type: "Hero", props: { tag: "Explore the world", headline: "Adventures Worth Remembering", subtext: "Curated trips and unforgettable experiences.", imageUrl: "", ctaLabel: "Plan a Trip", ctaLink: "#contact", align: "center" } },
        { type: "Cards", props: { title: "Popular Destinations", subtitle: "", cards: [
          { title: "Destination One", body: "A short teaser about this destination.", imageUrl: "", link: "" },
          { title: "Destination Two", body: "A short teaser about this destination.", imageUrl: "", link: "" },
        ] } },
        { type: "Gallery", props: { title: "Trip Highlights", images: [{ url: "", caption: "" }, { url: "", caption: "" }, { url: "", caption: "" }] } },
        { type: "Testimonials", props: { title: "Traveler Stories", items: [{ quote: "Best trip we've ever taken!", author: "Traveler", role: "Verified trip" }] } },
        { type: "Newsletter", props: { title: "Get Travel Deals", subtitle: "Exclusive offers straight to your inbox.", placeholder: "Enter your email", ctaLabel: "Subscribe" } },
        { type: "Map", props: { title: "Visit Our Office", subtitle: "", address: "Your Travel Agency Address", mapEmbedUrl: "" } },
        { type: "Contact", props: { title: "Start Planning", subtitle: "", address: "Your Travel Agency Address", phone: "+91 90000 00011", email: "hello@yourtravelco.com", mapEmbedUrl: "" } },
        footer({ logoText: "Your Travel Co.", tagline: "" }),
      ],
    },
  },
  {
    name: "Fine Dining Restaurant",
    category: "Restaurant",
    blocks: {
      blocks: [
        navbar({
          logoText: "Maison Noir",
          links: [
            { label: "Home", href: "#home" },
            { label: "Tasting Menu", href: "#menu" },
            { label: "Our Story", href: "#about" },
            { label: "Reservations", href: "#contact" },
          ],
          ctaLabel: "Reserve a Table",
        }),
        {
          type: "Hero",
          props: {
            tag: "Est. 2015",
            headline: "An Evening Worth Savoring",
            subtext: "Seasonal tasting menus crafted by Chef Antoine, paired with a curated wine list.",
            imageUrl: "",
            ctaLabel: "Reserve a Table",
            ctaLink: "#contact",
            align: "center",
          },
        },
        {
          type: "Video",
          props: { title: "A Look Inside Our Kitchen", subtitle: "", videoUrl: "", posterUrl: "" },
        },
        {
          type: "RestaurantMenu",
          props: {
            title: "Tasting Menu",
            subtitle: "Seven courses, reimagined seasonally",
            categories: [
              {
                name: "Amuse-Bouche",
                items: [{ name: "Chef's Selection", description: "A small welcome from the kitchen.", price: "-", imageUrl: "" }],
              },
              {
                name: "Signature Courses",
                items: [
                  { name: "Seared Scallop, Beurre Blanc", description: "With foraged mushroom and truffle oil.", price: "1,400", imageUrl: "" },
                  { name: "Slow-Braised Short Rib", description: "48-hour braise, root vegetable purée.", price: "1,900", imageUrl: "" },
                ],
              },
            ],
          },
        },
        {
          type: "Team",
          props: {
            title: "Meet Chef Antoine",
            subtitle: "20 years across three Michelin kitchens",
            members: [{ name: "Chef Antoine Laurent", role: "Executive Chef", photoUrl: "", bio: "Brings classical French technique to seasonal, locally-sourced ingredients." }],
          },
        },
        {
          type: "Statistics",
          props: {
            title: "",
            subtitle: "",
            stats: [
              { value: "15+", label: "Years of Excellence" },
              { value: "7", label: "Course Tasting Menu" },
              { value: "120+", label: "Wine Labels" },
              { value: "4.9", label: "Guest Rating" },
            ],
          },
        },
        {
          type: "Testimonials",
          props: {
            title: "Guest Experiences",
            items: [
              { quote: "Every course was a revelation. The best meal of the year.", author: "Food Critic", role: "Local Press" },
              { quote: "Impeccable service, unforgettable flavors.", author: "Guest", role: "Verified reservation" },
            ],
          },
        },
        {
          type: "Cta",
          props: { title: "Tables Are Limited", subtitle: "Reserve your evening with us today.", ctaLabel: "Reserve a Table", ctaLink: "#contact", background: "dark" },
        },
        {
          type: "Contact",
          props: { title: "Reservations", subtitle: "By appointment only, Tuesday - Sunday.", address: "12 Rue de la Table, Your City", phone: "+91 90000 00012", email: "reservations@maisonnoir.com", mapEmbedUrl: "" },
        },
        footer({ logoText: "Maison Noir", tagline: "Fine dining, quietly done well." }),
      ],
    },
  },
  {
    name: "Fast Casual Restaurant",
    category: "Restaurant",
    blocks: {
      blocks: [
        navbar({
          logoText: "Grill & Go",
          links: [
            { label: "Home", href: "#home" },
            { label: "Menu", href: "#menu" },
            { label: "Locations", href: "#locations" },
            { label: "Contact", href: "#contact" },
          ],
          ctaLabel: "Order Online",
        }),
        {
          type: "Hero",
          props: {
            tag: "Fast. Fresh. Flame-grilled.",
            headline: "Big Flavor, No Wait",
            subtext: "Build your own bowl or grab a combo - ready in under 5 minutes.",
            imageUrl: "",
            ctaLabel: "Order Online",
            ctaLink: "#menu",
            align: "left",
          },
        },
        {
          type: "Statistics",
          props: {
            title: "",
            subtitle: "",
            stats: [
              { value: "5 min", label: "Average Wait" },
              { value: "12", label: "Locations" },
              { value: "1M+", label: "Bowls Served" },
              { value: "4.7", label: "App Rating" },
            ],
          },
        },
        {
          type: "Cards",
          props: {
            title: "Build Your Combo",
            subtitle: "",
            cards: [
              { title: "Grill Bowl", body: "Choice of protein, rice, and toppings.", imageUrl: "", link: "#menu" },
              { title: "Loaded Fries", body: "Piled high with your favorite fixings.", imageUrl: "", link: "#menu" },
              { title: "Combo Meal", body: "Bowl + drink + side, best value.", imageUrl: "", link: "#menu" },
            ],
          },
        },
        {
          type: "RestaurantMenu",
          props: {
            title: "Popular Picks",
            subtitle: "",
            categories: [
              {
                name: "Bowls",
                items: [
                  { name: "Classic Grill Bowl", description: "Grilled chicken, rice, house sauce.", price: "220", imageUrl: "" },
                  { name: "Spicy Paneer Bowl", description: "Marinated paneer, spiced rice, slaw.", price: "210", imageUrl: "" },
                ],
              },
            ],
          },
        },
        {
          type: "ImageGrid",
          props: { title: "Fresh, Every Time", columns: "4", images: [{ url: "" }, { url: "" }, { url: "" }, { url: "" }] },
        },
        {
          type: "Cta",
          props: { title: "Download The App", subtitle: "Order ahead and skip the line.", ctaLabel: "Order Online", ctaLink: "#menu", background: "primary" },
        },
        {
          type: "Contact",
          props: { title: "Find a Location Near You", subtitle: "", address: "12 outlets across the city", phone: "+91 90000 00013", email: "hello@grillandgo.com", mapEmbedUrl: "" },
        },
        footer({ logoText: "Grill & Go", tagline: "Fast, fresh, flame-grilled." }),
      ],
    },
  },
  {
    name: "Family Restaurant",
    category: "Restaurant",
    blocks: {
      blocks: [
        navbar({
          logoText: "The Family Table",
          links: [
            { label: "Home", href: "#home" },
            { label: "Menu", href: "#menu" },
            { label: "Gallery", href: "#gallery" },
            { label: "Events", href: "#events" },
            { label: "Contact", href: "#contact" },
          ],
          ctaLabel: "Book a Table",
        }),
        {
          type: "Hero",
          props: {
            tag: "Since 1998, a family tradition",
            headline: "Good Food, Good Company",
            subtext: "A warm, welcoming spot for every occasion - from Sunday lunches to birthday parties.",
            imageUrl: "",
            ctaLabel: "Book a Table",
            ctaLink: "#contact",
            align: "left",
          },
        },
        {
          type: "Features",
          props: {
            title: "Why Families Love Us",
            subtitle: "",
            items: [
              { icon: "mdi-account-child", title: "Kids Menu", body: "Fun, tasty options for the little ones." },
              { icon: "mdi-cake-variant", title: "Party Packages", body: "Birthdays and celebrations, made easy." },
              { icon: "mdi-sofa", title: "Comfortable Seating", body: "Spacious tables for the whole family." },
            ],
          },
        },
        {
          type: "RestaurantMenu",
          props: {
            title: "Family Favorites",
            subtitle: "",
            categories: [
              {
                name: "For The Table",
                items: [
                  { name: "Family Thali", description: "A little bit of everything, serves 4.", price: "899", imageUrl: "" },
                  { name: "Kids Combo", description: "Mini meal with a surprise treat.", price: "149", imageUrl: "" },
                ],
              },
            ],
          },
        },
        {
          type: "Gallery",
          props: { title: "Moments With Us", images: [{ url: "", caption: "" }, { url: "", caption: "" }, { url: "", caption: "" }] },
        },
        {
          type: "Testimonials",
          props: {
            title: "What Families Say",
            items: [
              { quote: "Our kids' favorite place - and ours too!", author: "Regular Family", role: "Weekly guest" },
              { quote: "Hosted my daughter's birthday here, everyone loved it.", author: "Parent", role: "Party host" },
            ],
          },
        },
        {
          type: "Cta",
          props: { title: "Planning a Celebration?", subtitle: "Ask us about our party packages.", ctaLabel: "Book a Table", ctaLink: "#contact", background: "light" },
        },
        {
          type: "Contact",
          props: { title: "Visit Us Today", subtitle: "", address: "45 Family Lane, Your City", phone: "+91 90000 00014", email: "hello@thefamilytable.com", mapEmbedUrl: "" },
        },
        footer({ logoText: "The Family Table", tagline: "Good food, good company." }),
      ],
    },
  },
  {
    name: "Bakery Cafe",
    category: "Cafe",
    blocks: {
      blocks: [
        navbar({
          logoText: "Flour & Bloom",
          links: [
            { label: "Home", href: "#home" },
            { label: "Bakery", href: "#menu" },
            { label: "Gallery", href: "#gallery" },
            { label: "Contact", href: "#contact" },
          ],
          ctaLabel: "Order Ahead",
        }),
        {
          type: "Hero",
          props: {
            tag: "Baked fresh every morning",
            headline: "Warm Bread, Warmer Welcome",
            subtext: "Artisan breads, pastries, and cakes made from scratch daily.",
            imageUrl: "",
            ctaLabel: "See Today's Bakes",
            ctaLink: "#menu",
            align: "center",
          },
        },
        {
          type: "Cards",
          props: {
            title: "Today's Specials",
            subtitle: "",
            cards: [
              { title: "Sourdough Loaf", body: "24-hour fermented, crisp crust.", imageUrl: "", link: "" },
              { title: "Butter Croissant", body: "Flaky, buttery, baked twice daily.", imageUrl: "", link: "" },
              { title: "Seasonal Fruit Tart", body: "Fresh fruit, house pastry cream.", imageUrl: "", link: "" },
            ],
          },
        },
        {
          type: "RestaurantMenu",
          props: {
            title: "Our Bakery Menu",
            subtitle: "",
            categories: [
              {
                name: "Breads",
                items: [
                  { name: "Sourdough", description: "Classic tangy sourdough loaf.", price: "180", imageUrl: "" },
                  { name: "Multigrain", description: "Packed with seeds and grains.", price: "160", imageUrl: "" },
                ],
              },
              {
                name: "Pastries",
                items: [{ name: "Almond Croissant", description: "Filled with almond cream.", price: "140", imageUrl: "" }],
              },
            ],
          },
        },
        {
          type: "Gallery",
          props: { title: "From Our Oven", images: [{ url: "", caption: "" }, { url: "", caption: "" }, { url: "", caption: "" }] },
        },
        {
          type: "Newsletter",
          props: { title: "Never Miss a Fresh Bake", subtitle: "Get our daily specials in your inbox.", placeholder: "Enter your email", ctaLabel: "Subscribe" },
        },
        {
          type: "Contact",
          props: { title: "Visit Our Bakery", subtitle: "", address: "8 Baker Street, Your City", phone: "+91 90000 00015", email: "hello@flourandbloom.com", mapEmbedUrl: "" },
        },
        footer({ logoText: "Flour & Bloom", tagline: "Baked fresh, every morning." }),
      ],
    },
  },
  {
    name: "Coffee Roastery",
    category: "Cafe",
    blocks: {
      blocks: [
        navbar({
          logoText: "Origin Roasters",
          links: [
            { label: "Home", href: "#home" },
            { label: "Coffee", href: "#menu" },
            { label: "Our Story", href: "#about" },
            { label: "Contact", href: "#contact" },
          ],
          ctaLabel: "Shop Coffee",
        }),
        {
          type: "Hero",
          props: {
            tag: "Single-origin, small-batch",
            headline: "Coffee, Traced To Its Roots",
            subtext: "We roast in-house, sourcing directly from farms we know by name.",
            imageUrl: "",
            ctaLabel: "Shop Coffee",
            ctaLink: "#menu",
            align: "left",
          },
        },
        {
          type: "Features",
          props: {
            title: "Our Approach",
            subtitle: "",
            items: [
              { icon: "mdi-map-marker-radius", title: "Direct Trade", body: "Sourced directly from growers we visit each year." },
              { icon: "mdi-fire", title: "Small-Batch Roasting", body: "Roasted fresh in-house, never mass-produced." },
              { icon: "mdi-leaf", title: "Sustainable", body: "Compostable packaging, fair farmer pricing." },
            ],
          },
        },
        {
          type: "RestaurantMenu",
          props: {
            title: "Coffee Menu",
            subtitle: "",
            categories: [
              {
                name: "Espresso",
                items: [
                  { name: "Single Origin Espresso", description: "Rotating farm selection.", price: "160", imageUrl: "" },
                  { name: "Flat White", description: "Double shot, steamed milk.", price: "180", imageUrl: "" },
                ],
              },
              {
                name: "Filter",
                items: [{ name: "Pour Over", description: "Brewed to order, your choice of bean.", price: "220", imageUrl: "" }],
              },
            ],
          },
        },
        {
          type: "Team",
          props: {
            title: "Meet Our Roasters",
            subtitle: "",
            members: [{ name: "Head Roaster", role: "Roastmaster", photoUrl: "", bio: "12 years perfecting the roast curve." }],
          },
        },
        {
          type: "Video",
          props: { title: "From Farm to Cup", subtitle: "", videoUrl: "", posterUrl: "" },
        },
        {
          type: "Statistics",
          props: {
            title: "",
            subtitle: "",
            stats: [
              { value: "8", label: "Origin Countries" },
              { value: "15", label: "Coffees Roasted Weekly" },
              { value: "100%", label: "Direct Trade" },
              { value: "4.8", label: "Customer Rating" },
            ],
          },
        },
        {
          type: "Contact",
          props: { title: "Visit The Roastery", subtitle: "", address: "22 Bean Avenue, Your City", phone: "+91 90000 00016", email: "hello@originroasters.com", mapEmbedUrl: "" },
        },
        footer({ logoText: "Origin Roasters", tagline: "Coffee, traced to its roots." }),
      ],
    },
  },
  {
    name: "Cozy Neighborhood Cafe",
    category: "Cafe",
    blocks: {
      blocks: [
        navbar({
          logoText: "The Corner Cafe",
          links: [
            { label: "Home", href: "#home" },
            { label: "Menu", href: "#menu" },
            { label: "Events", href: "#events" },
            { label: "Contact", href: "#contact" },
          ],
          ctaLabel: "See Menu",
        }),
        {
          type: "Hero",
          props: {
            tag: "Your neighborhood living room",
            headline: "Come As You Are",
            subtext: "A cozy corner for coffee, conversation, and a little quiet.",
            imageUrl: "",
            ctaLabel: "See Menu",
            ctaLink: "#menu",
            align: "center",
          },
        },
        {
          type: "RestaurantMenu",
          props: {
            title: "On The Menu",
            subtitle: "",
            categories: [
              {
                name: "Coffee & Tea",
                items: [
                  { name: "House Latte", description: "Our signature blend, steamed milk.", price: "170", imageUrl: "" },
                  { name: "Chai Latte", description: "Spiced tea, steamed milk, honey.", price: "150", imageUrl: "" },
                ],
              },
              {
                name: "Light Bites",
                items: [{ name: "Avocado Toast", description: "Sourdough, chili flakes, lime.", price: "230", imageUrl: "" }],
              },
            ],
          },
        },
        {
          type: "Gallery",
          props: { title: "Our Little Corner", images: [{ url: "", caption: "" }, { url: "", caption: "" }, { url: "", caption: "" }] },
        },
        {
          type: "Cards",
          props: {
            title: "Happening Here",
            subtitle: "Weekly events open to all",
            cards: [
              { title: "Open Mic Night", body: "Every Thursday, 7pm.", imageUrl: "", link: "" },
              { title: "Board Game Sunday", body: "Bring friends, we'll bring games.", imageUrl: "", link: "" },
            ],
          },
        },
        {
          type: "Testimonials",
          props: {
            title: "From Our Regulars",
            items: [{ quote: "Feels like a second home. Best chai in town.", author: "Regular", role: "Neighborhood guest" }],
          },
        },
        {
          type: "Map",
          props: { title: "Find Us On The Corner", subtitle: "", address: "Corner of 5th & Main, Your City", mapEmbedUrl: "" },
        },
        {
          type: "Contact",
          props: { title: "Say Hello", subtitle: "", address: "Corner of 5th & Main, Your City", phone: "+91 90000 00017", email: "hello@thecornercafe.com", mapEmbedUrl: "" },
        },
        footer({ logoText: "The Corner Cafe", tagline: "Come as you are." }),
      ],
    },
  },
];

async function main() {
  console.log("Seeding website-builder themes...");
  await prisma.theme.deleteMany({ where: { isSystem: true } });
  for (const theme of THEMES) {
    await prisma.theme.create({ data: { ...theme, isSystem: true } });
  }

  console.log("Seeding website-builder templates...");
  await prisma.template.deleteMany({ where: { isSystem: true } });
  for (const template of TEMPLATES) {
    await prisma.template.create({ data: { ...template, isSystem: true } });
  }

  console.log(`Seeded ${THEMES.length} themes and ${TEMPLATES.length} templates.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
