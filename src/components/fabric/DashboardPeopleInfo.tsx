/**
  People Portal UI
  Copyright (C) 2026  Atheesh Thirumalairajan

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
// ... (rest of imports are fine as they were added in previous step)
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { PhoneInput } from '@/components/ui/phone-input';
import { Slider } from '@/components/ui/slider';
import Cropper, { type Area, type Point } from 'react-easy-crop';
import imageCompression from 'browser-image-compression';
import { PEOPLEPORTAL_SERVER_ENDPOINT } from '@/commons/config';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from "sonner";
import { Loader2, Mail, Phone, Calendar, GraduationCap, Briefcase, ShieldCheck, MapPin, Clock, Tag, AlertCircle, Users, UserCog, Minus, Plus, UploadCloud, Check, ChevronsUpDown } from 'lucide-react';

// --- Interfaces matching the Backend ---

const TeamType = {
    PROJECT: "PROJECT",
    CORPORATE: "CORPORATE",
    BOOTCAMP: "BOOTCAMP",
    SERVICE: "SERVICE"
} as const;
type TeamType = typeof TeamType[keyof typeof TeamType];

const SeasonType = {
    FALL: "FALL",
    SPRING: "SPRING"
} as const;
type SeasonType = typeof SeasonType[keyof typeof SeasonType];

const ServiceSeasonType = {
    ROLLING: "ROLLING"
} as const;
type ServiceSeasonType = typeof ServiceSeasonType[keyof typeof ServiceSeasonType];

interface TeamAttributeDefinition {
    friendlyName: string;
    teamType: TeamType;
    seasonType: SeasonType | ServiceSeasonType;
    seasonYear: number;
    description: string;
}

interface UserAttributeDefinition {
    major: string;
    expectedGrad: string | Date;
    phoneNumber: string;
    roles: { [key: string]: string };
    alumniAccount: boolean;
    avatar?: string;
}

interface UMDApiMajorListResponse {
    college: string,
    major_id: string,
    name: string,
    url: string
}

const getCroppedImg = (imageSrc: string, pixelCrop: Area): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.src = imageSrc;
        image.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                reject(new Error("No 2d context"));
                return;
            }

            canvas.width = pixelCrop.width;
            canvas.height = pixelCrop.height;

            ctx.drawImage(
                image,
                pixelCrop.x,
                pixelCrop.y,
                pixelCrop.width,
                pixelCrop.height,
                0,
                0,
                pixelCrop.width,
                pixelCrop.height
            );

            canvas.toBlob((blob) => {
                if (!blob) {
                    reject(new Error("Canvas is empty"));
                    return;
                }
                resolve(blob);
            }, 'image/webp', 1.0);
        };
        image.onerror = (error) => reject(error);
    });
};

const validateFileSignature = (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = (e) => {
            if (!e.target?.result || typeof e.target.result === 'string') {
                resolve(false);
                return;
            }

            const arr = (new Uint8Array(e.target.result)).subarray(0, 4);
            let header = "";
            for (let i = 0; i < arr.length; i++) {
                header += arr[i].toString(16);
            }

            let isValid = false;
            switch (true) {
                case header.startsWith("89504e47"): // PNG
                case header.startsWith("ffd8ff"):   // JPEG
                case header.startsWith("47494638"): // GIF
                case header.startsWith("52494646"): // RIFF (WebP)
                    isValid = true;
                    break;
                default:
                    isValid = false;
                    break;
            }
            resolve(isValid);
        };
        reader.readAsArrayBuffer(file.slice(0, 4));
    });
};

interface UserInformationBrief {
    pk: string;
    username: string;
    name: string;
    email: string;
    memberSince: string;
    active: boolean;
    attributes: UserAttributeDefinition;
    is_superuser: boolean;
    avatar: string;
}

interface UserInformationDetail extends UserInformationBrief {
    groups: string[];
    last_login: string;
    type: string;
    groupsInfo: {
        name: string;
        pk: string;
        attributes: TeamAttributeDefinition;
    }[];
}

// Team info from /api/org/people/{username}/memberof
interface TeamInformationBrief {
    name: string;
    pk: string;
    parent: string | null;
    teamType: TeamType;
    seasonType: SeasonType | ServiceSeasonType;
    seasonYear: number;
    description: string;
    friendlyName: string;
    peoplePortalCreation: boolean;
}

// Reusable Info Card Component
const InfoItem = ({ icon: Icon, label, value, href, className }: { icon: React.ElementType, label: string, value: string | React.ReactNode, href?: string, className?: string }) => (
    <div className={cn("flex flex-col gap-1 p-3 rounded-lg border bg-card text-card-foreground shadow-sm", className)}>
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <Icon className="h-3.5 w-3.5" />
            {label}
        </div>
        <div className="text-sm font-semibold truncate" title={typeof value === 'string' ? value : undefined}>
            {href ? (
                <a href={href} className="hover:text-primary hover:underline transition-colors">
                    {value}
                </a>
            ) : (
                value
            )}
        </div>
    </div>
);

const EditProfileModal = ({
    isOpen,
    onClose,
    user,
    onSuccess
}: {
    isOpen: boolean,
    onClose: () => void,
    user: UserInformationDetail,
    onSuccess: (updatedUser: UserInformationDetail) => void
}) => {
    const [phoneNumber, setPhoneNumber] = useState(user.attributes.phoneNumber ?? "");
    const [expectedGrad, setExpectedGrad] = useState(user.attributes.expectedGrad ? format(new Date(user.attributes.expectedGrad), 'yyyy-MM-dd') : "");
    const [selectedMajor, setSelectedMajor] = useState<UMDApiMajorListResponse | null>(null);
    const [majors, setMajors] = useState<UMDApiMajorListResponse[]>([]);
    const [majorListOpen, setMajorListOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Avatar state
    const [preview, setPreview] = useState<string | null>(user.avatar);
    const [avatarKey, setAvatarKey] = useState<string | undefined>(user.attributes.avatar);
    const [isUploading, setIsUploading] = useState(false);
    const fileUploadRef = useRef<HTMLInputElement>(null);

    // Cropping state
    const [cropImage, setCropImage] = useState<string | null>(null);
    const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
    const [isCroppingOpen, setIsCroppingOpen] = useState(false);

    useEffect(() => {
        fetch("https://api.umd.io/v1/majors/list")
            .then(res => res.json())
            .then(data => {
                setMajors(data);
                const currentMajor = data.find((m: any) => m.name === user.attributes.major);
                if (currentMajor) setSelectedMajor(currentMajor);
            })
            .catch(() => toast.error("Failed to fetch majors"));
    }, [user.attributes.major]);

    async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) {
            const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
            if (!allowedTypes.includes(file.type)) {
                toast.error("Invalid file type", { description: "Please upload an image (JPEG, PNG, WEBP, GIF)" });
                return;
            }

            const isValidSignature = await validateFileSignature(file);
            if (!isValidSignature) {
                toast.error("Invalid file content", { description: "The file content does not match its extension." });
                return;
            }

            if (file.size > 20 * 1024 * 1024) {
                toast.error("File is too large!", { description: "Maximum file size is 20MB" });
                return;
            }

            setCrop({ x: 0, y: 0 });
            setZoom(1);
            setCroppedAreaPixels(null);

            const reader = new FileReader();
            reader.addEventListener('load', () => {
                setCropImage(reader.result as string);
                setIsCroppingOpen(true);
                if (fileUploadRef.current) fileUploadRef.current.value = "";
            });
            reader.readAsDataURL(file);
        }
    }

    async function processAndUploadAvatar() {
        if (!cropImage || !croppedAreaPixels) return;
        toast.info("Processing image...");
        setIsUploading(true);
        setIsCroppingOpen(false);

        try {
            const croppedBlob = await getCroppedImg(cropImage, croppedAreaPixels);
            const options = {
                maxSizeMB: 0.45,
                maxWidthOrHeight: 512,
                useWebWorker: true,
                initialQuality: 0.8,
                fileType: 'image/webp'
            };

            const compressedBlob = await imageCompression(new File([croppedBlob], "avatar.webp", { type: "image/webp" }), options);
            const uploadFile = new File([compressedBlob], "avatar.webp", { type: "image/webp" });

            const url = URL.createObjectURL(uploadFile);
            setPreview(url);

            const res = await fetch(`${PEOPLEPORTAL_SERVER_ENDPOINT}/api/org/people/avatar/self/upload-url?fileName=${encodeURIComponent(uploadFile.name)}&contentType=${encodeURIComponent(uploadFile.type)}`);
            if (!res.ok) throw new Error("Failed to get upload URL");

            const { uploadUrl, key, fields } = await res.json();
            const formData = new FormData();
            Object.entries(fields).forEach(([k, v]) => formData.append(k, v as string));
            formData.append("file", uploadFile);

            const uploadRes = await fetch(uploadUrl, { method: 'POST', body: formData });
            if (!uploadRes.ok) throw new Error("Failed to upload to S3");

            setAvatarKey(key);
            toast.success("Profile picture updated!");
        } catch (e: any) {
            toast.error("Upload failed", { description: e.message });
        } finally {
            setIsUploading(false);
            setCropImage(null);
        }
    }

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch(`${PEOPLEPORTAL_SERVER_ENDPOINT}/api/org/people/${user.pk}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    major: selectedMajor?.name,
                    phoneNumber,
                    expectedGrad: expectedGrad ? new Date(expectedGrad) : undefined,
                    avatar: avatarKey
                })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || "Failed to update profile");
            }

            toast.success("Profile updated successfully!");
            onSuccess({
                ...user,
                avatar: preview || user.avatar,
                attributes: {
                    ...user.attributes,
                    major: selectedMajor?.name || user.attributes.major,
                    phoneNumber,
                    expectedGrad: expectedGrad || user.attributes.expectedGrad,
                    avatar: avatarKey || user.attributes.avatar
                }
            });
            onClose();
        } catch (e: any) {
            toast.error("Save failed", { description: e.message });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit Profile</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col items-center gap-6 py-4">
                    <div className="relative group">
                        <Avatar className="size-32 cursor-pointer transition-opacity group-hover:opacity-80" onClick={() => fileUploadRef.current?.click()}>
                            <AvatarImage src={preview ?? undefined} />
                            <AvatarFallback>
                                {isUploading ? <Loader2 className="animate-spin" /> : <UploadCloud className="size-8" />}
                            </AvatarFallback>
                        </Avatar>
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                            <UploadCloud className="text-white drop-shadow-md" />
                        </div>
                        <input type="file" ref={fileUploadRef} className="hidden" accept="image/*" onChange={onFileChange} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                        <div className="space-y-2">
                            <Label>Phone Number</Label>
                            <PhoneInput value={phoneNumber} onChange={setPhoneNumber} defaultCountry="US" />
                        </div>
                        <div className="space-y-2">
                            <Label>Major</Label>
                            <Popover open={majorListOpen} onOpenChange={setMajorListOpen} modal={true}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full justify-between overflow-hidden">
                                        <span className="truncate text-left mr-2">
                                            {selectedMajor?.name || "Select Major"}
                                        </span>
                                        <ChevronsUpDown className="size-4 opacity-50 shrink-0" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[400px] p-0">
                                    <Command>
                                        <CommandInput placeholder="Search major..." />
                                        <CommandList className="max-h-[300px] overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
                                            <CommandEmpty>No major found.</CommandEmpty>
                                            <CommandGroup>
                                                {majors.map(m => (
                                                    <CommandItem
                                                        key={m.major_id}
                                                        onSelect={() => {
                                                            setSelectedMajor(m);
                                                            setMajorListOpen(false);
                                                        }}
                                                    >
                                                        <div className="flex flex-col">
                                                            <span>{m.name}</span>
                                                            <span className="text-xs text-muted-foreground">{m.college}</span>
                                                        </div>
                                                        <Check className={cn("ml-auto size-4", selectedMajor?.major_id === m.major_id ? "opacity-100" : "opacity-0")} />
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <Label>Expected Graduation</Label>
                            <Input type="date" value={expectedGrad} onChange={e => setExpectedGrad(e.target.value)} />
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
                        Save Changes
                    </Button>
                </DialogFooter>

                <Dialog open={isCroppingOpen} onOpenChange={setIsCroppingOpen}>
                    <DialogContent className="max-w-xl">
                        <DialogTitle>Crop Picture</DialogTitle>
                        <div className="relative h-[400px] w-full mt-4 bg-muted rounded-md overflow-hidden">
                            {cropImage && (
                                <Cropper
                                    image={cropImage}
                                    crop={crop}
                                    zoom={zoom}
                                    aspect={1}
                                    onCropChange={setCrop}
                                    onZoomChange={setZoom}
                                    onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
                                />
                            )}
                        </div>
                        <div className="flex items-center gap-4 mt-4">
                            <Minus className="size-4 cursor-pointer" onClick={() => setZoom(z => Math.max(1, z - 0.1))} />
                            <Slider value={[zoom]} min={1} max={3} step={0.1} onValueChange={v => setZoom(v[0])} className="flex-1" />
                            <Plus className="size-4 cursor-pointer" onClick={() => setZoom(z => Math.min(3, z + 0.1))} />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsCroppingOpen(false)}>Cancel</Button>
                            <Button onClick={processAndUploadAvatar}>Crop & Upload</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </DialogContent>
        </Dialog>
    );
};

export const DashboardPeopleInfo = ({ loggedInUser }: { loggedInUser?: { pk: string } }) => {
    const { userPk } = useParams<{ userPk: string }>();
    const navigate = useNavigate();
    const [user, setUser] = useState<UserInformationDetail | null>(null);
    const [userTeamsMap, setUserTeamsMap] = useState<Map<string, TeamInformationBrief>>(new Map());
    const [loading, setLoading] = useState(true);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    useEffect(() => {
        if (!userPk) return;

        const fetchData = async () => {
            try {
                // 1. Fetch user info
                const userRes = await fetch(`${PEOPLEPORTAL_SERVER_ENDPOINT}/api/org/people/${userPk}`);
                if (!userRes.ok) throw new Error("Failed to fetch user");
                const userData: UserInformationDetail = await userRes.json();
                setUser(userData);

                // 2. Fetch user's root teams using their username
                const teamsRes = await fetch(`${PEOPLEPORTAL_SERVER_ENDPOINT}/api/org/people/${userData.username}/memberof`, {
                    credentials: 'include'
                });
                if (teamsRes.ok) {
                    const teamsData = await teamsRes.json();
                    // Build map: teamPk -> TeamInfo
                    const teamsMap = new Map<string, TeamInformationBrief>();
                    for (const team of teamsData.teams || []) {
                        teamsMap.set(team.pk, team);
                    }
                    setUserTeamsMap(teamsMap);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [userPk]);

    if (loading) {
        return (
            <div className="flex flex-col md:flex-row gap-8 p-6">
                <div className="flex flex-col gap-4 md:w-1/4 items-center md:items-start">
                    <Skeleton className="h-48 w-48 md:h-56 md:w-56 rounded-full" />
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-5 w-32" />
                </div>
                <div className="flex-1 space-y-4">
                    <Skeleton className="h-28 w-full" />
                    <Skeleton className="h-28 w-full" />
                </div>
            </div>
        );
    }

    if (!user) {
        return <div className="p-8 text-center text-muted-foreground">User not found.</div>;
    }

    const { attributes } = user;
    const initials = user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

    // Build role entries from attributes.roles, looking up team info from map
    // Filter out entries where team info couldn't be found
    const roleEntries = Object.entries(attributes?.roles || {})
        .map(([teamPk, roleTitle]) => ({
            teamPk,
            roleTitle,
            teamInfo: userTeamsMap.get(teamPk)
        }))
        .filter(entry => entry.teamInfo !== undefined);

    return (
        <div className="flex flex-col md:flex-row gap-8 p-6 h-full overflow-y-auto">
            {/* Left Column: User Profile Sidebar (Slim) */}
            <div className="flex flex-col gap-6 md:w-[260px] shrink-0">
                <div className="md:sticky md:top-2 flex flex-col gap-5">
                    {/* Avatar & Basic Identity */}
                    <div className="flex flex-col items-center md:items-start text-center md:text-left gap-3">
                        <Avatar className="h-48 w-48 md:h-64 md:w-64 ring-4 ring-background shadow-xl rounded-full bg-muted">
                            <AvatarImage src={user.avatar} alt={user.name} className="object-cover" />
                            <AvatarFallback className="text-5xl text-muted-foreground">{initials}</AvatarFallback>
                        </Avatar>

                        <div className="space-y-0.5 mt-2 w-full">
                            <h1 className="text-2xl font-bold tracking-tight text-foreground break-words leading-tight">{user.name}</h1>
                            <p className="text-base text-muted-foreground font-mono break-all">{user.username}</p>
                        </div>

                        {user && loggedInUser?.pk === user.pk && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full mt-2 gap-2 border-primary/20 hover:bg-primary/5 hover:text-primary transition-all duration-200"
                                onClick={() => {
                                    setIsEditModalOpen(true);
                                }}
                            >
                                <UserCog className="h-3.5 w-3.5" />
                                <span className="text-xs font-semibold">Edit Profile</span>
                            </Button>
                        )}

                        {user && (
                            <EditProfileModal
                                isOpen={isEditModalOpen}
                                onClose={() => setIsEditModalOpen(false)}
                                user={user}
                                onSuccess={(updatedUser) => setUser(updatedUser)}
                            />
                        )}

                        <div className="flex flex-wrap justify-center md:justify-start gap-1.5 mt-1">
                            <Badge variant={user.active ? "default" : "destructive"} className={cn("px-2 py-0.5 text-xs", user.active ? "bg-emerald-600 hover:bg-emerald-700" : "")}>
                                {user.active ? "Active" : "Inactive"}
                            </Badge>
                            {user.is_superuser && (
                                <Badge variant="secondary" className="gap-1 text-xs border-purple-500/30 text-purple-600 bg-purple-500/10 hover:bg-purple-500/20">
                                    <ShieldCheck className="h-3 w-3" />
                                    Admin
                                </Badge>
                            )}
                            {attributes?.alumniAccount && (
                                <Badge variant="secondary" className="gap-1 text-xs border-amber-500/30 text-amber-600 bg-amber-500/10 hover:bg-amber-500/20">
                                    <GraduationCap className="h-3 w-3" />
                                    Alumni
                                </Badge>
                            )}
                        </div>
                    </div>

                    {/* Contact Info Only - GitHub Style */}
                    <div className="flex flex-col gap-2 text-sm text-muted-foreground border-t pt-4">
                        <div
                            className="flex items-center gap-2 cursor-pointer hover:text-foreground transition-colors group"
                            onClick={async () => {
                                try {
                                    await navigator.clipboard.writeText(user.email);
                                    toast.success("Email Copied to Clipboard!");
                                } catch (err) {
                                    toast.error("Failed to copy email to clipboard");
                                }
                            }}
                            title="Click to Copy Email"
                        >
                            <Mail className="h-4 w-4 shrink-0" />
                            <span className="truncate group-hover:underline underline-offset-4">
                                {user.email}
                            </span>
                        </div>

                        {attributes?.phoneNumber && (
                            <div
                                className="flex items-center gap-2 cursor-pointer hover:text-foreground transition-colors group"
                                onClick={async () => {
                                    try {
                                        await navigator.clipboard.writeText(attributes.phoneNumber!);
                                        toast.success("Phone Number Copied to Clipboard!")
                                    } catch (err) {
                                        toast.error("Failed to copy phone number to clipboard");
                                    }
                                }}
                                title="Click to Copy Phone Number"
                            >
                                <Phone className="h-4 w-4 shrink-0" />
                                <span className="truncate group-hover:underline underline-offset-4">
                                    {attributes.phoneNumber}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Right Column: Main Content */}
            <div className="flex-1 min-w-0 space-y-6">

                {/* Section 1: Personal Details Grid */}
                <section>
                    <h2 className="text-base font-semibold mb-3 flex items-center gap-2 text-muted-foreground">
                        <Users className="h-4 w-4" />
                        Personal Details
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                        {attributes?.major && (
                            <InfoItem icon={GraduationCap} label="Major" value={attributes.major} />
                        )}
                        {attributes?.expectedGrad && (
                            <InfoItem icon={Calendar} label="Class of" value={format(new Date(attributes.expectedGrad), 'yyyy')} />
                        )}
                        {user.memberSince && (
                            <InfoItem icon={MapPin} label="Joined" value={format(new Date(user.memberSince), 'MMM yyyy')} />
                        )}
                        {user.last_login && (
                            <InfoItem icon={Clock} label="Last Seen" value={formatDistanceToNow(new Date(user.last_login)) + " ago"} />
                        )}
                        {user.type && user.type !== 'internal' && (
                            <InfoItem icon={Tag} label="Account Type" value={<span className="capitalize">{user.type}</span>} />
                        )}
                    </div>
                </section>

                <section>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-base font-semibold flex items-center gap-2 text-muted-foreground">
                            <Briefcase className="h-4 w-4" />
                            Team Memberships
                        </h2>
                        <Badge variant="outline" className="text-muted-foreground text-xs">
                            {roleEntries.length} Total
                        </Badge>
                    </div>

                    {roleEntries.length > 0 ? (
                        <div className="grid gap-2.5 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                            {roleEntries.map(({ teamPk, roleTitle, teamInfo }) => (
                                <Card
                                    key={teamPk}
                                    className="hover:border-primary/50 transition-colors cursor-pointer"
                                    onClick={() => navigate(`/org/teams/${teamPk}`)}
                                >
                                    <CardContent className="p-3">
                                        <div className="flex flex-col gap-1.5">
                                            <div className="flex items-center justify-between gap-2">
                                                <CardTitle className="text-sm font-bold text-foreground truncate" title={teamInfo?.friendlyName || teamPk}>
                                                    {teamInfo?.friendlyName || "Unknown Team"}
                                                </CardTitle>
                                                {teamInfo?.teamType && (
                                                    <Badge variant="secondary" className="text-[9px] h-4 px-1 rounded font-normal text-muted-foreground shrink-0">
                                                        {teamInfo.teamType}
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-500">
                                                <Briefcase className="h-3 w-3" />
                                                {roleTitle}
                                            </div>

                                            {teamInfo?.description && (
                                                <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5" title={teamInfo.description}>
                                                    {teamInfo.description}
                                                </p>
                                            )}

                                            <div className="flex items-center justify-between pt-1.5 border-t text-[10px] text-muted-foreground mt-1">
                                                <div className="flex items-center gap-1">
                                                    {(teamInfo?.seasonType || teamInfo?.seasonYear) ? (
                                                        <>
                                                            <Calendar className="h-2.5 w-2.5 opacity-70" />
                                                            <span>{teamInfo.seasonType} {teamInfo.seasonYear}</span>
                                                        </>
                                                    ) : (
                                                        <span>Ongoing</span>
                                                    )}
                                                </div>
                                                <span className="font-mono opacity-50">{teamPk.substring(0, 6)}</span>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center p-8 border border-dashed rounded-lg bg-muted/5">
                            <AlertCircle className="h-8 w-8 text-muted-foreground/50 mb-2" />
                            <p className="text-sm text-muted-foreground font-medium">No team memberships found.</p>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
};