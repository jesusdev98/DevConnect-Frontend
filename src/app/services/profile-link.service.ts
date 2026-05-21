import { Injectable } from '@angular/core';

export type ProfileLinkType = 'github' | 'linkedin' | 'web';

export type ProfileLinksData = Record<ProfileLinkType, string | null>;

export interface ProfileLink {
  type: ProfileLinkType;
  label: string;
  icon: string;
  url: string;
}

const PROFILE_LINKS_META: Array<Omit<ProfileLink, 'url'>> = [
  { type: 'github', label: 'GitHub', icon: '🐙' },
  { type: 'linkedin', label: 'LinkedIn', icon: '💼' },
  { type: 'web', label: 'Web personal', icon: '🌐' },
];

@Injectable({ providedIn: 'root' })
export class ProfileLinkService {
  getDefaultLinks(): ProfileLink[] {
    return PROFILE_LINKS_META.map((link) => ({ ...link, url: '' }));
  }

  fromData(data: Partial<ProfileLinksData> | null | undefined): ProfileLink[] {
    const payload = data ?? {};
    return PROFILE_LINKS_META.map((link) => ({
      ...link,
      url: this.normalizeUrl(payload[link.type] ?? null),
    }));
  }

  toData(links: readonly ProfileLink[]): ProfileLinksData {
    return PROFILE_LINKS_META.reduce((acc, link) => {
      const current = links.find((item) => item.type === link.type);
      acc[link.type] = this.normalizeUrl(current?.url ?? null) || null;
      return acc;
    }, {
      github: null,
      linkedin: null,
      web: null,
    } as ProfileLinksData);
  }

  updateLink(links: readonly ProfileLink[], type: ProfileLinkType, url: string): ProfileLink[] {
    return links.map((link) => (link.type === type ? { ...link, url: this.normalizeUrl(url) } : link));
  }

  private normalizeUrl(value: string | null | undefined): string {
    if (typeof value !== 'string') {
      return '';
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return '';
    }

    try {
      const url = new URL(trimmed);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
    } catch {
      return '';
    }
  }
}
