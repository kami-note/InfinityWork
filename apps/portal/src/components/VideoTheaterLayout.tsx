"use client";

import { useState } from "react";
import { VideoPlayer } from "./viewers/VideoPlayer";
import { UpNextList } from "./UpNextList";
import type { FileDto } from "@/lib/file-manager-client";

export function VideoTheaterLayout({ url, name, upNext }: { url: string; name: string; upNext: FileDto[] }) {
  const [theaterMode, setTheaterMode] = useState(false);

  return (
    <div className={`flex flex-col gap-4 ${theaterMode ? "" : "lg:flex-row"}`}>
      <div className="min-w-0 flex-1">
        <VideoPlayer url={url} name={name} theaterMode={theaterMode} onToggleTheater={() => setTheaterMode((v) => !v)} />
      </div>
      <UpNextList videos={upNext} />
    </div>
  );
}
