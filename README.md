# 🏢 Vailo Admin Platform - Technical Documentation

## 📖 1. Project Overview
Vailo is a modern, single-page application (SPA) built to serve as an AI Concierge and Property Management Admin Panel. It allows administrators to securely log in, manage short-term rental properties, and maintain a robust CRM of property owners and agents.

---

## 🛠️ 2. Tech Stack & Dependencies
The project utilizes a highly modern, lightweight, and fast stack:

* **Core Framework:** React v19.2.5
* **Build Tool:** Vite (React + TypeScript template)
* **Routing:** React Router DOM v7.15.0 for seamless, reload-free page transitions.
* **Styling:** Tailwind CSS v4.2.4 (utilizing the `@tailwindcss/vite` plugin for lightning-fast compilation).
* **Backend / Database:** Firebase v12.13.0 (Firebase Authentication & Cloud Firestore).
* **Icons:** Lucide React v1.14.0 for clean, scalable SVG dashboard icons.

---

## 📂 3. Project Structure
The source code (`/src`) is organized logically to separate concerns between UI components, page layouts, and backend services:

```text
src/
├── components/
│   ├── Layout.tsx         # Main application shell (Sidebar & Header)
│   └── Login.tsx          # Firebase authentication UI
├── lib/
│   └── firebase.ts        # Firebase initialization & exports (auth, db)
├── pages/
│   ├── AddOwner.tsx       # Form to create new CRM contacts
│   ├── AddProperty.tsx    # Form to add new rental properties
│   ├── OwnersPage.tsx     # Real-time list view of CRM contacts
│   └── PropertiesPage.tsx # Real-time list view of properties
├── App.tsx                # Auth state listener and Route definitions
└── index.css              # Global styles & Tailwind import
```

---

## ✨ 4. Core Features & Modules

### 🔐 A. Authentication & Security
* **Firebase Auth Integration:** Utilizes `signInWithEmailAndPassword` to authenticate administrators securely.
* **Session Management:** App leverages `onAuthStateChanged` to listen for session states.
* **Protected Routing:** Users cannot view the Layout or any nested routes until securely authenticated. Unauthenticated users are strictly served the Login screen.
* **Global Logout:** Integrated directly into the top header of the Layout component.

### 🖥️ B. Global Layout
* **Fixed Sidebar Navigation:** Uses React Router's `<Link>` components and `useLocation` hook to instantly navigate between pages and highlight the active route.
* **Responsive Shell:** Designed with a fixed left sidebar and a flexible right content area to ensure data tables and forms scroll independently of the navigation.

### 🏠 C. Property Management
* **Real-time Database:** The Properties list uses Firestore's `onSnapshot` to render new properties or removals instantly without needing a page refresh.
* **Smart Form Features:**
    * **Auto-generated Internal Codes:** Generates unique tracking IDs (e.g., `VLO-X7Y8Z9`) upon form load.
    * **Live Slug Generator:** Listens to the Property Name and Type fields to dynamically create a URL-friendly slug (e.g., `villa-paschalis/double`) unless manually overridden.
    * **Custom Country Code Selector:** A native, Tailwind-styled compound input field for International Phone numbers.
* **Data Structure:** Stores comprehensive listing URLs, Google Map links, GPS coordinates, WiFi credentials, and owner references.

### 👥 D. Owners CRM
* **Status Indicators:** Visual badge system highlighting user states (Active in green, Trial in blue, Deactive in red).
* **Comprehensive Data Capture:** Collects standard CRM data alongside VAT numbers, Billing Addresses, and Internal Notes.
* **Access Control Preparations:** Captures intended Roles (admin, agent, owner) and an initial temporary password, laying the groundwork for individual portal access.

---

## 🗄️ 5. Firestore Database Schema

The application relies on two main root collections:

### 📄 `properties` collection
* **Description:** Documents representing individual rental units.
* **Fields:** `propertyName`, `propertyTypeName`, `urlSlug`, `latitude`, `longitude`, `hostPhoneCode`, `hostPhone`, `ownerFullName`, `internalRefCode`, `createdAt`.

### 📄 `owners` collection
* **Description:** Documents representing CRM contacts.
* **Fields:** `fullName`, `email`, `phone`, `company`, `role`, `status`, `propertiesCount`, `password` (temporary), `createdAt`.

---

## 🚀 Getting Started

### Prerequisites
* Node.js (v20.19+ or v22.12+)
* npm

### Installation
1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/your-username/vailo.git](https://github.com/your-username/vailo.git)
    cd vailo
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Configure Firebase:**
    Update `src/lib/firebase.ts` with your project's configuration keys from the Firebase Console.
4.  **Run the development server:**
    ```bash
    npm run dev
    ```