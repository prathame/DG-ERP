import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Dhandho Engineering Academy',
  tagline: 'Internal engineering onboarding for DG-ERP (Dhandho) — become productive without tribal knowledge',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://engineering.dhandho.app',
  baseUrl: '/',

  organizationName: 'prathame',
  projectName: 'DG-ERP',

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  markdown: {
    mermaid: true,
  },

  themes: [
    '@docusaurus/theme-mermaid',
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: true,
        language: ['en'],
        highlightSearchTermsOnTargetPage: true,
        explicitSearchResultPath: true,
        docsRouteBasePath: '/',
      },
    ],
  ],

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/prathame/DG-ERP/tree/main/engineering-academy/',
          showLastUpdateTime: false,
          showLastUpdateAuthor: false,
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    docs: {
      sidebar: {
        hideable: true,
        autoCollapseCategories: true,
      },
    },
    navbar: {
      title: 'Dhandho Academy',
      logo: {
        alt: 'Dhandho Engineering Academy',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'academySidebar',
          position: 'left',
          label: 'Curriculum',
        },
        { to: '/architecture/system-overview', label: 'Architecture', position: 'left' },
        { to: '/api/overview', label: 'API', position: 'left' },
        { to: '/security/threat-model', label: 'Security', position: 'left' },
        { to: '/quizzes', label: 'Quizzes', position: 'left' },
        {
          href: 'https://github.com/prathame/DG-ERP',
          label: 'DG-ERP Source',
          position: 'right',
        },
        {
          href: 'https://dhandho.app',
          label: 'Product',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Start Here',
          items: [
            { label: 'Welcome', to: '/' },
            { label: 'Day-1 Onboarding', to: '/tutorials/day-1-onboarding' },
            { label: 'Business Goals', to: '/overview/business-goals' },
            { label: 'Technology Stack', to: '/overview/tech-stack' },
          ],
        },
        {
          title: 'Deep Dives',
          items: [
            { label: 'Architecture', to: '/architecture/system-overview' },
            { label: 'Database', to: '/database/schema-overview' },
            { label: 'Auth & AuthZ', to: '/security/authentication' },
            { label: 'File Walkthrough', to: '/files' },
          ],
        },
        {
          title: 'Operations',
          items: [
            { label: 'Deployment', to: '/deployment/overview' },
            { label: 'SRE & Runbooks', to: '/sre/overview' },
            { label: 'Performance', to: '/performance/overview' },
            { label: 'Troubleshooting', to: '/runbooks' },
          ],
        },
        {
          title: 'Learning',
          items: [
            { label: 'Quizzes', to: '/quizzes' },
            { label: 'Animations', to: '/animations' },
            { label: 'Glossary', to: '/glossary' },
            { label: 'Tutorials', to: '/tutorials/day-1-onboarding' },
          ],
        },
      ],
      copyright: `Dhandho Engineering Academy — built for ownership transfer of DG-ERP. Not product docs; an interactive training platform.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'sql', 'typescript', 'tsx', 'yaml', 'docker', 'nginx'],
    },
    mermaid: {
      theme: { light: 'neutral', dark: 'dark' },
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
