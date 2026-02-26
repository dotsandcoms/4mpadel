# @burkcorp/reactmath

A drop-in React SEO plugin with an admin panel for managing meta tags, redirects, and analytics.

## Features

- 🎯 **SEO Admin Panel** - Real-time scoring, previews, and optimization tips
- 📝 **Meta Tag Management** - Title, description, keywords, Open Graph
- 🔄 **Redirect Manager** - 301/302 redirects with regex support
- 📊 **Analytics Dashboard** - Page score tracking
- 🤖 **AI Generation** - OpenAI-powered title/description suggestions
- ☁️ **GitHub Integration** - Push config changes directly to repo

## Installation

```bash
# From private GitHub repo
npm install github:burkcorp/reactmath
```

## Quick Start

### 1. Wrap your app with the provider

```jsx
// main.jsx or App.jsx
import { SEOProvider } from '@burkcorp/reactmath';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <SEOProvider>
        <App />
      </SEOProvider>
    </BrowserRouter>
  </React.StrictMode>
);
```

### 2. Add the admin panel to your app

```jsx
// App.jsx
import { SEOAdminPanel } from '@burkcorp/reactmath';

function App() {
  return (
    <>
      <Routes>
        {/* your routes */}
      </Routes>
      
      {/* Add the admin panel - appears as floating button */}
      <SEOAdminPanel />
    </>
  );
}
```

### 3. Add SEO head tags to pages

```jsx
// Any page component
import { SEOHead } from '@burkcorp/reactmath';

function HomePage() {
  return (
    <>
      <SEOHead 
        title="Home"
        description="Welcome to our site"
        keywords={['react', 'seo']}
      />
      {/* page content */}
    </>
  );
}
```

## Panel Activation

| Environment | Visibility |
|-------------|------------|
| **Development** | Always visible (floating gear button) |
| **Production** | Hidden by default, requires URL param |

### Accessing on Production
Add `?seo-admin` to any URL:
```
https://yoursite.com?seo-admin
https://yoursite.com/about?seo-admin
```

### Customizing the Activation Param
You can change the URL param in Settings > Panel Activation, or pass a prop:
```jsx
<SEOAdminPanel activationParam="my-secret-key" />
// Then access with: yoursite.com?my-secret-key
```

## Configuration

Create `src/seo/seo.config.json` in your project:

```json
{
  "site": {
    "name": "Your Site",
    "titleTemplate": "%s | Your Site",
    "siteUrl": "https://yoursite.com"
  },
  "pages": {
    "/": {
      "title": "Home",
      "description": "Welcome to our site"
    }
  }
}
```

## Exported Components

| Component | Description |
|-----------|-------------|
| `SEOProvider` | Context provider - wrap your app |
| `SEOAdminPanel` | Floating admin panel |
| `SEOHead` | Meta tags component for pages |
| `SchemaOrg` | Structured data component |
| `Breadcrumbs` | SEO-friendly breadcrumb navigation |
| `ImageSEO` | Image optimization wrapper |

## Exported Hooks

| Hook | Description |
|------|-------------|
| `useSEOContext` | Access SEO config and functions |
| `useSEO` | Get current page SEO data |
| `useSEOScore` | Get SEO score for current page |

## License

MIT
