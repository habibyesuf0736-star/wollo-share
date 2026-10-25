import React from "react";
import Modal from "./Modal.jsx";

export default function ConfirmModal({ open, title, message, confirmLabel = "Delete", onConfirm, onClose }) {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={title} size="narrow">
      <p className="text-secondary small">{message}</p>
      <div className="d-flex justify-content-end gap-2">
        <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-coral"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
