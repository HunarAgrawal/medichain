/** Starting text for common findings, by study type. Doctors edit them; nothing is signed unread. */

import type { StudyTypeId } from "./api";

type Template = { findings: string; impression: string };

export const REPORT_TEMPLATES: Record<StudyTypeId, Record<string, Template>> = {
  chest_xray: {
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
  },
  brain_tumor: {
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
  },
  cbc: {
    Normal: {
      findings:
        "Haemoglobin, red cell indices, total and differential leucocyte counts and platelet count are within reference intervals. Peripheral smear: normocytic normochromic red cells.",
      impression: "Complete blood count within normal limits.",
    },
    Anaemia: {
      findings:
        "Haemoglobin and MCV are low. Peripheral smear: microcytic hypochromic red cells with anisocytosis. Leucocyte and platelet counts are within reference intervals.",
      impression:
        "Microcytic hypochromic anaemia, suggestive of iron deficiency. Serum ferritin and iron studies advised.",
    },
    Leucocytosis: {
      findings:
        "Total leucocyte count is raised with neutrophilia. No immature cells on the smear. Haemoglobin and platelet count are within reference intervals.",
      impression:
        "Neutrophilic leucocytosis, suggestive of an acute bacterial infection. Correlate clinically.",
    },
    Thrombocytopenia: {
      findings:
        "Platelet count is low; no platelet clumps on the smear. Red cell and leucocyte parameters are within reference intervals.",
      impression:
        "Thrombocytopenia. Repeat the count and evaluate for viral fever (dengue NS1/IgM) as clinically indicated.",
    },
  },
  drug_screen: {
    Negative: {
      findings: "All six analytes are below the screening cutoffs.",
      impression: "Negative urine drug screen.",
    },
    Positive: {
      findings:
        "Cannabinoids (THC) reactive above the 50 ng/mL screening cutoff. Other analytes are below their cutoffs.",
      impression:
        "Presumptive positive for cannabinoids. This is a screening result; confirm by GC-MS or LC-MS/MS before any employment decision.",
    },
  },
};
