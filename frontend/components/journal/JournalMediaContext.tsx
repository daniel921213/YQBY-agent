"use client";
import { createContext } from "react";
import { journalImageUrl } from "@/lib/journal-api";

export const JournalMediaContext = createContext<{
  imageUrl: (id: number, signal?: AbortSignal) => Promise<string>;
  upload?: (file: File) => Promise<number>;
}>({ imageUrl: journalImageUrl });
