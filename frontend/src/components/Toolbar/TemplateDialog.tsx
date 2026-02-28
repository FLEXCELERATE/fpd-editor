/** Dialog for selecting FPB templates from the template library. */

import { useState } from "react";
import { templates, type FpbTemplate } from "../../data/templates";

interface TemplateDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (template: FpbTemplate) => void;
}

export function TemplateDialog({ open, onClose, onSelect }: TemplateDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!open) return null;

  const selectedTemplate = selectedId
    ? templates.find((t) => t.id === selectedId)
    : null;

  const handleSelect = () => {
    if (selectedTemplate) {
      onSelect(selectedTemplate);
      onClose();
    }
  };

  return (
    <>
      <div className="template-dialog__backdrop" onClick={onClose} />
      <div className="template-dialog">
        <div className="template-dialog__header">
          <h2 className="template-dialog__title">New from Template</h2>
          <button
            className="template-dialog__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="template-dialog__content">
          <div className="template-dialog__list">
            {templates.map((template) => (
              <button
                key={template.id}
                className={`template-dialog__item ${
                  selectedId === template.id ? "template-dialog__item--selected" : ""
                }`}
                onClick={() => setSelectedId(template.id)}
              >
                <div className="template-dialog__item-name">{template.name}</div>
                <div className="template-dialog__item-description">
                  {template.description}
                </div>
              </button>
            ))}
          </div>
          <div className="template-dialog__preview">
            {selectedTemplate ? (
              <>
                <div className="template-dialog__preview-header">
                  <strong>{selectedTemplate.name}</strong>
                </div>
                <pre className="template-dialog__preview-content">
                  {selectedTemplate.content}
                </pre>
              </>
            ) : (
              <div className="template-dialog__preview-placeholder">
                Select a template to preview
              </div>
            )}
          </div>
        </div>
        <div className="template-dialog__footer">
          <button
            className="template-dialog__button template-dialog__button--secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="template-dialog__button template-dialog__button--primary"
            onClick={handleSelect}
            disabled={!selectedTemplate}
          >
            Use Template
          </button>
        </div>
      </div>
    </>
  );
}
