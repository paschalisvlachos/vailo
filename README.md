# 🏢 Vailo Admin Platform - Technical Documentation

## 📖 1. Project Overview
Vailo is a modern, single-page application (SPA) built to serve as an AI Concierge and Enterprise-Grade Property Management System (PMS). It allows administrators to securely log in, manage multi-unit short-term rental properties, maintain a robust relational CRM of property owners, and handle live calendar synchronizations.

---

## 🛠️ 2. Tech Stack & Dependencies
The project utilizes a highly modern, lightweight, and fast stack:

* **Core Framework:** React v19.2.5
* **Build Tool:** Vite (React + TypeScript template)
* **Routing:** React Router DOM v7.15.0 (utilizing Nested Routing via `<Outlet />` for modular dashboards).
* **Styling:** Tailwind CSS v4.2.4 (utilizing the `@tailwindcss/vite` plugin for lightning-fast compilation).
* **Backend / Database:** Firebase v12.13.0 (Authentication, Cloud Firestore, and Cloud Storage).
* **Icons:** Lucide React v1.14.0 for clean, scalable SVG dashboard icons.

---

## 📂 3. Project Structure
The source code (`/src`) is organized logically to separate concerns between UI components, page layouts, and backend services. Property management is highly modularized into a dedicated folder.

```text
src/
├── components/
│   ├── Layout.tsx             # Main application shell (Sidebar & Header)
│   └── Login.tsx              # Firebase authentication UI
├── lib/
│   └── firebase.ts            # Firebase initialization (auth, db, storage)
├── pages/
│   ├── properties/            # Modular Multi-Unit Property Dashboard
│   │   ├── PropertyLayout.tsx # Fixed Header & Sub-nav wrapper
│   │   ├── Overview.tsx       # General info & Relational Owner data
│   │   ├── PropertyTypes.tsx  # Multi-unit configurations (WiFi, GPS, iCal)
│   │   ├── LocalGems.tsx      # Curated guidebook with smart distance math
│   │   ├── GreenScore.tsx     # 100-point sustainability calculator
│   │   ├── Calendar.tsx       # Visual booking grid (iCal + Manual)
│   │   └── Reservations.tsx   # Master booking list & conflict engine
│   ├── AddOwner.tsx           # Form to create new CRM contacts
│   ├── AddProperty.tsx        # Form to add new parent properties
│   ├── OwnersPage.tsx         # Real-time list view of CRM contacts
│   └── PropertiesPage.tsx     # Real-time list view of properties
├── App.tsx                    # Auth state listener and Route definitions
└── index.css                  # Global styles & Tailwind import
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

### 🏠 C. Enterprise Property Management (PMS)
* **Relational Architecture:** Properties are dynamically linked to Agents/Owners in the CRM via an `ownerId`. Updating an owner's phone number automatically reflects across all their assigned properties.
* **Multi-Unit Support (Property Types):** A single "Property" acts as a parent hub, containing multiple distinct "Property Types" (e.g., Suite 1, Studio A). Each unit holds its own exact GPS coordinates, WiFi credentials, and iCal feed.
* **Local Gems Guidebook:**
    * **Smart Import:** Extracts GPS coordinates directly from Google Maps URLs.
    * **Cost-Free Math:** Utilizes the Haversine formula to automatically calculate driving distance (km) and time between the specific unit and the Gem without using paid Google APIs.
    * **Firebase Storage:** Built-in image uploading for custom photos.
* **Green Score Matrix:** A real-time, interactive 100-point calculator that dynamically scores a unit's eco-friendly features (Energy Class, Solar, Recycling, etc.) to highlight sustainability.
* **Calendar & Reservations Engine:**
    * **Proxy-Waterfall iCal Sync:** Bypasses OTA (Airbnb/Booking) bot firewalls using a cascading array of open-source CORS proxies to extract live `.ics` data with zero backend costs.
    * **Double-Booking Prevention:** A mathematical engine safely intercepts manual reservation entries, cross-referencing dates (`New Check-In < Existing Check-Out && New Check-Out > Existing Check-In`) to strictly prevent overlapping bookings in the same unit.

### 👥 D. Owners CRM
* **Status Indicators:** Visual badge system highlighting user states (Active in green, Trial in blue, Deactive in red).
* **Comprehensive Data Capture:** Collects standard CRM data alongside VAT numbers, Billing Addresses, and Internal Notes.
* **Access Control Preparations:** Captures intended Roles (admin, agent, owner) and an initial temporary password, laying the groundwork for individual portal access.

---

## 🗄️ 5. Firestore Database Schema

The application utilizes a highly relational, nested Document-Database architecture:

### 📄 `owners` collection
* **Description:** Documents representing CRM contacts.
* **Fields:** `fullName`, `email`, `phone`, `company`, `role`, `status`, `propertiesCount`, `password` (temporary), `createdAt`.

### 📄 `properties` collection (Parent Hub)
* **Description:** Top-level wrappers for a location or building.
* **Fields:** `propertyName`, `urlSlug`, `internalRefCode`, `ownerId` (Relational link), `createdAt`.
* **Sub-Collections:**
    * 📁 **`propertyTypes`** (The specific rentable units)
        * **Fields:** `propertyTypeName`, `latitude`, `longitude`, `wifiName`, `wifiPassword`, `iCalUrl`, `syncedBookings` (Array of objects containing `start`, `end`, `provider`, `isInvited`, `id`), `ownerId`.
        * **Sub-Collections (Scoped per Unit):**
            * 📁 **`localGems`**: Stores `name`, `category`, `distanceKm`, `rating`, `photoUrl`, `isLegitPick`, `isDailyTrip`.
            * 📁 **`greenScore`**: A single document (`data`) storing `totalScore` (0-100), `energyClass`, and 9 specific boolean feature toggles.

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