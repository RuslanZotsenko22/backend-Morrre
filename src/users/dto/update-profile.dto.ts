export class UpdateProfileDto {
displayName?: string;
avatarUrl?: string;
location?: string;
about?: string;
industry?: string;
whatWeDid?: string[];
socials?: Partial<Record<'behance'|'dribbble'|'instagram'|'linkedin'|'x'|'website', string>>;
}