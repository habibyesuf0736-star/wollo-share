import React, { useState } from "react";
import { formatFileSize, readSmallFileAsDataUrl, typeFromFileName } from "../lib/utils.js";

export default function FileInput({ onFile, hint = "PDF, PPT, DOC, XLS, video up to 250 KB is stored inline" }) {
  const [fileName, setFileName] = useState("");

  return (
    <div>
      <input
        type="file"
        className="form-control"
        onChange={async (event) => {
          const file = event.target.files && event.target.files[0];
          if (!file) {
            setFileName("");
            onFile(null);
            return;
          }
          const dataUrl = await readSmallFileAsDataUrl(file);
          setFileName(file.name);
          onFile({
            name: file.name,
            size: formatFileSize(file.size),
            type: typeFromFileName(file.name),
            dataUrl
          });
        }}
      />
      {fileName ? (
        <p className="small text-secondary mt-1 mb-0">
          Ready to upload: <strong>{fileName}</strong>
        </p>
      ) : (
        <p className="small text-secondary mt-1 mb-0">{hint}</p>
      )}
    </div>
  );
}
