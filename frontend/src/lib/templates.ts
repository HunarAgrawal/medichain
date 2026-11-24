/** Starting text for common findings. Radiologists edit them; nothing is signed unread. */
export const REPORT_TEMPLATES: Record<string, { findings: string; impression: string }> = {
  Normal: {
    findings:
      "Lungs are clear bilaterally. No focal consolidation, pleural effusion or pneumothorax. Cardiac silhouette and mediastinum are within normal limits. Visualised bones are unremarkable.",
    impression: "No acute cardiopulmonary abnormality.",
  },
  Pneumonia: {
    findings:
      "Patchy airspace opacities in the right lower zone with air bronchograms. No pleural effusion or pneumothorax. Cardiac size is normal.",
    impression:
      "Right lower zone consolidation, consistent with pneumonia. Clinical correlation and a follow-up radiograph after treatment are advised.",
  },
  "No tumor": {
    findings:
      "No intra-axial or extra-axial mass lesion. Ventricles and sulci are normal for age. No midline shift or abnormal enhancement.",
    impression: "No MRI evidence of a mass lesion.",
  },
  Glioma: {
    findings:
      "Heterogeneously enhancing intra-axial lesion in the left cerebral hemisphere with surrounding vasogenic oedema and mild mass effect on the adjacent ventricle.",
    impression:
      "Features suggestive of a glioma. Urgent neurosurgical and neuro-oncology referral recommended.",
  },
  Meningioma: {
    findings:
      "Well-circumscribed, homogeneously enhancing extra-axial dural-based lesion with a dural tail. No significant perilesional oedema.",
    impression: "Features consistent with a meningioma. Neurosurgical opinion advised.",
  },
  "Pituitary tumor": {
    findings:
      "Enhancing sellar and suprasellar lesion consistent with a pituitary macroadenoma, abutting the optic chiasm.",
    impression: "Pituitary macroadenoma. Endocrinology and neurosurgical correlation advised.",
  },
};
