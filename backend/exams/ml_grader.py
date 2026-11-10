"""
exams/ml_grader.py
ExMint Production Machine Learning & AI Evaluation Engine.

Features:
1. Sklearn TfidfVectorizer (Word 1-3 grams + Char 3-5 grams) & Cosine Similarity
2. Multi-Factor Feature Extractor (7 semantic & structural signals)
3. Sklearn GradientBoosting / RandomForest / Ridge / XGBoost / CatBoost Regressor Integration
4. Supervised AI Agent Training Pipeline on past graded examinee answers
5. Multi-Point Weighted Rubric Matcher with keyword coverage
6. Explainable AI Feedback & Rationale Generation
"""

import os
import re
import math
from typing import Dict, List, Any, Optional, Tuple

try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False
    np = None

# Sklearn imports
try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
    from sklearn.linear_model import Ridge
    from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
    import joblib
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

# XGBoost (optional high-performance gradient boosting)
try:
    import xgboost as xgb
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False

# CatBoost (optional categorical gradient boosting)
try:
    import catboost as cb
    CATBOOST_AVAILABLE = True
except ImportError:
    CATBOOST_AVAILABLE = False


# ── Text Cleaning & Utilities ─────────────────────────────────────────────────

STOP_WORDS = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any",
    "are", "aren't", "as", "at", "be", "because", "been", "before", "being", "below",
    "between", "both", "but", "by", "can", "can't", "cannot", "could", "couldn't", "did",
    "didn't", "do", "does", "doesn't", "doing", "don't", "down", "during", "each", "few",
    "for", "from", "further", "had", "hadn't", "has", "hasn't", "have", "haven't", "having",
    "he", "he'd", "he'll", "he's", "her", "here", "here's", "hers", "herself", "him",
    "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm", "i've", "if", "in",
    "into", "is", "isn't", "it", "it's", "its", "itself", "let's", "me", "more", "most",
    "mustn't", "my", "myself", "no", "nor", "not", "of", "off", "on", "once", "only",
    "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same",
    "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't", "so", "some",
    "such", "than", "that", "that's", "the", "their", "theirs", "them", "themselves",
    "then", "there", "there's", "these", "they", "they'd", "they'll", "they're", "they've",
    "this", "those", "through", "to", "too", "under", "until", "up", "very", "was",
    "wasn't", "we", "we'd", "we'll", "we're", "we've", "were", "weren't", "what",
    "what's", "when", "when's", "where", "where's", "which", "while", "who", "who's",
    "whom", "why", "why's", "with", "won't", "would", "wouldn't", "you", "you'd",
    "you'll", "you're", "you've", "your", "yours", "yourself", "yourselves"
}

def clean_text(text: str) -> str:
    if not text:
        return ""
    text = text.lower().strip()
    text = re.sub(r'[\r\n\t]+', ' ', text)
    text = re.sub(r'[^\w\s\.\,\-\+\*/\(\)]', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()

def tokenize(text: str, remove_stopwords: bool = True) -> List[str]:
    cleaned = clean_text(text)
    words = re.findall(r'\b[a-zA-Z0-9_\-\+\.]+\b', cleaned)
    if remove_stopwords:
        words = [w for w in words if w.lower() not in STOP_WORDS and len(w) > 1]
    return words


# ── Sklearn Vectorizer & Semantic Similarity Engine ───────────────────────────

def compute_sklearn_similarity(text1: str, text2: str) -> Tuple[float, float]:
    """
    Computes both word-level and character-level cosine similarities using Sklearn TfidfVectorizer.
    Returns: (word_sim, char_sim)
    """
    t1 = clean_text(text1)
    t2 = clean_text(text2)
    
    if not t1 or not t2:
        return 0.0, 0.0

    if not SKLEARN_AVAILABLE:
        # Fallback to token Counter cosine similarity
        words1 = tokenize(t1)
        words2 = tokenize(t2)
        if not words1 or not words2:
            return 0.0, 0.0
        set1, set2 = set(words1), set(words2)
        jaccard = len(set1 & set2) / len(set1 | set2) if (set1 | set2) else 0.0
        return jaccard, jaccard

    try:
        # Word n-grams (1, 2)
        word_vectorizer = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, stop_words="english")
        word_tfidf = word_vectorizer.fit_transform([t1, t2])
        word_sim = float(cosine_similarity(word_tfidf[0:1], word_tfidf[1:2])[0][0])
    except Exception:
        word_sim = 0.0

    try:
        # Char n-grams (3, 5) for typo and morphological tolerance
        char_vectorizer = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True)
        char_tfidf = char_vectorizer.fit_transform([t1, t2])
        char_sim = float(cosine_similarity(char_tfidf[0:1], char_tfidf[1:2])[0][0])
    except Exception:
        char_sim = 0.0

    return max(0.0, min(1.0, word_sim)), max(0.0, min(1.0, char_sim))


# ── Rubric & Key Point Evaluator ──────────────────────────────────────────────

def evaluate_rubric_point(student_text: str, rubric_item: Any) -> Dict[str, Any]:
    if isinstance(rubric_item, str):
        point_text = rubric_item
        keywords = tokenize(rubric_item, remove_stopwords=True)
        weight = 1.0
    elif isinstance(rubric_item, dict):
        point_text = rubric_item.get("point") or rubric_item.get("description") or str(rubric_item)
        keywords = rubric_item.get("keywords") or []
        if isinstance(keywords, str):
            keywords = [k.strip() for k in keywords.split(",") if k.strip()]
        if not keywords:
            keywords = tokenize(point_text, remove_stopwords=True)
        weight = float(rubric_item.get("weight") or rubric_item.get("marks") or 1.0)
    else:
        point_text = str(rubric_item)
        keywords = tokenize(point_text, remove_stopwords=True)
        weight = 1.0

    word_sim, char_sim = compute_sklearn_similarity(student_text, point_text)
    sim_score = (0.6 * word_sim) + (0.4 * char_sim)

    student_tokens = set(tokenize(student_text, remove_stopwords=True))
    matched_keywords = []
    for kw in keywords:
        kw_clean = kw.lower().strip()
        if kw_clean in student_tokens or kw_clean in student_text.lower():
            matched_keywords.append(kw)

    kw_coverage = len(matched_keywords) / len(keywords) if keywords else 0.5
    point_score = (0.6 * sim_score) + (0.4 * kw_coverage)
    is_satisfied = point_score >= 0.38

    return {
        "point": point_text,
        "weight": weight,
        "score": round(point_score, 3),
        "is_satisfied": is_satisfied,
        "matched_keywords": matched_keywords,
        "total_keywords": keywords,
        "keyword_coverage": round(kw_coverage * 100, 1),
    }


# ── Feature Engineering Vectorizer ────────────────────────────────────────────

class SklearnFeatureExtractor:
    """
    Extracts a feature vector for machine learning regression / classification:
    Features:
    0: Word-level TF-IDF similarity with expected notes
    1: Char-level TF-IDF similarity with expected notes
    2: Reference context similarity (if provided)
    3: Rubric coverage ratio (satisfied rubrics / total)
    4: Average rubric similarity score
    5: Target word count length factor
    6: Keyword overlap density
    """
    FEATURE_NAMES = [
        "tfidf_word_sim",
        "tfidf_char_sim",
        "context_sim",
        "rubric_coverage_ratio",
        "rubric_score_avg",
        "length_factor",
        "keyword_density",
    ]

    @classmethod
    def extract_features(
        cls,
        student_answer: str,
        expected_notes: str,
        reference_context: str = "",
        rubrics: Optional[List[Any]] = None,
        max_marks: int = 5,
        question_type: str = "long",
    ) -> Tuple[np.ndarray, List[Dict[str, Any]]]:
        student_answer = student_answer.strip() if student_answer else ""
        expected_notes = expected_notes.strip() if expected_notes else ""
        
        # 1. Expected notes similarities
        word_sim, char_sim = compute_sklearn_similarity(student_answer, expected_notes or reference_context)
        
        # 2. Context similarity
        if reference_context:
            c_word_sim, _ = compute_sklearn_similarity(student_answer, reference_context)
        else:
            c_word_sim = word_sim

        # 3. Rubric Breakdown & Scores
        rubric_items = rubrics or []
        if not rubric_items and expected_notes:
            lines = [l.strip("-*• 123456789.)") for l in expected_notes.split("\n") if len(l.strip()) > 5]
            if len(lines) > 1:
                rubric_items = lines

        rubric_results = []
        if rubric_items:
            for item in rubric_items:
                rubric_results.append(evaluate_rubric_point(student_answer, item))
            satisfied = sum(1 for r in rubric_results if r["is_satisfied"])
            rubric_coverage = satisfied / len(rubric_results)
            rubric_avg = sum(r["score"] for r in rubric_results) / len(rubric_results)
        else:
            rubric_coverage = word_sim
            rubric_avg = (word_sim + char_sim) / 2

        # 4. Length Factor
        student_words = len(tokenize(student_answer, remove_stopwords=False))
        target_words = max(8, int(max_marks * 6)) if question_type == "short" else max(24, int(max_marks * 16))
        length_factor = min(1.0, student_words / target_words) if target_words else 1.0

        # 5. Keyword Density Overlap
        st_tokens = set(tokenize(student_answer, remove_stopwords=True))
        ref_tokens = set(tokenize((expected_notes + " " + reference_context), remove_stopwords=True))
        overlap = len(st_tokens & ref_tokens) / len(ref_tokens) if ref_tokens else 0.5

        features = np.array([
            word_sim,
            char_sim,
            c_word_sim,
            rubric_coverage,
            rubric_avg,
            length_factor,
            overlap,
        ], dtype=np.float32)

        return features, rubric_results


# ── Supervised AI Agent Training Pipeline ─────────────────────────────────────

class MLGradingAgentTrainer:
    """
    Allows examiners and admins to train an AI Evaluation Model (Sklearn / XGBoost / CatBoost)
    directly from verified graded submissions in the database!
    """

    @classmethod
    def train_model(cls, training_data: List[Dict[str, Any]], algorithm: str = "gradient_boosting") -> Dict[str, Any]:
        """
        training_data: list of dicts containing:
        - student_answer
        - expected_notes
        - reference_context
        - rubrics
        - max_marks
        - question_type
        - marks_awarded (target y)
        """
        if len(training_data) < 3:
            return {
                "success": False,
                "error": "At least 3 verified graded samples are required to train the ML agent.",
            }

        X_list = []
        y_list = []

        for sample in training_data:
            max_m = float(sample.get("max_marks", 5)) or 1.0
            awarded = float(sample.get("marks_awarded", 0.0))
            norm_y = max(0.0, min(1.0, awarded / max_m)) # Normalized 0 to 1

            feats, _ = SklearnFeatureExtractor.extract_features(
                student_answer=sample.get("student_answer", ""),
                expected_notes=sample.get("expected_notes", ""),
                reference_context=sample.get("reference_context", ""),
                rubrics=sample.get("rubrics", []),
                max_marks=int(max_m),
                question_type=sample.get("question_type", "long"),
            )
            X_list.append(feats)
            y_list.append(norm_y)

        X = np.array(X_list)
        y = np.array(y_list)

        # Select ML model
        if algorithm == "xgboost" and XGBOOST_AVAILABLE:
            model = xgb.XGBRegressor(n_estimators=50, max_depth=3, learning_rate=0.1, random_state=42)
            model_name = "XGBoost Regressor v2.0"
        elif algorithm == "catboost" and CATBOOST_AVAILABLE:
            model = cb.CatBoostRegressor(iterations=50, depth=3, learning_rate=0.1, verbose=0, random_seed=42)
            model_name = "CatBoost Regressor"
        elif algorithm == "random_forest":
            model = RandomForestRegressor(n_estimators=40, max_depth=4, random_state=42)
            model_name = "Sklearn Random Forest Regressor"
        else:
            model = GradientBoostingRegressor(n_estimators=40, max_depth=3, learning_rate=0.1, random_state=42)
            model_name = "Sklearn Gradient Boosting Regressor"

        model.fit(X, y)
        preds = model.predict(X)
        r2 = float(r2_score(y, preds)) if len(y) > 2 else 1.0
        mae = float(mean_absolute_error(y, preds))

        # Extract feature importances if available
        importances = {}
        if hasattr(model, "feature_importances_"):
            for name, imp in zip(SklearnFeatureExtractor.FEATURE_NAMES, model.feature_importances_):
                importances[name] = round(float(imp), 4)

        return {
            "success": True,
            "model_name": model_name,
            "samples_trained": len(training_data),
            "r2_score": round(r2, 3),
            "mean_absolute_error": round(mae, 4),
            "feature_importances": importances,
            "trained_features": SklearnFeatureExtractor.FEATURE_NAMES,
        }


# ── ExMint AI Grading Agent ───────────────────────────────────────────────────

class ExMintAIGrader:
    """
    Production-grade ML & NLP Grading Agent for ExMint LMS.
    Combines Sklearn TF-IDF Feature Extraction with multi-factor regression heuristics.
    """

    def __init__(self):
        # Calibrated default regression coefficients for 7 semantic features
        self.weights = np.array([
            0.25, # tfidf_word_sim
            0.20, # tfidf_char_sim
            0.10, # context_sim
            0.25, # rubric_coverage_ratio
            0.10, # rubric_score_avg
            0.05, # length_factor
            0.05, # keyword_density
        ], dtype=np.float32)

    def grade(
        self,
        question_text: str,
        student_answer: str,
        max_marks: int,
        expected_notes: str = "",
        reference_context: str = "",
        rubrics: Optional[List[Any]] = None,
        question_type: str = "long",
    ) -> Dict[str, Any]:
        student_answer = student_answer.strip() if student_answer else ""
        max_marks = float(max_marks) if max_marks else 1.0

        if not student_answer:
            return {
                "marks_awarded": 0.0,
                "max_marks": max_marks,
                "percentage": 0.0,
                "is_correct": False,
                "feedback": "No answer provided.",
                "reason": "The answer was left blank.",
                "semantic_score": 0.0,
                "rubric_breakdown": [],
                "method": "exmint_ml_sklearn",
            }

        ref_corpus = expected_notes or reference_context or question_text

        # Extract features using Sklearn
        feats, rubric_results = SklearnFeatureExtractor.extract_features(
            student_answer=student_answer,
            expected_notes=ref_corpus,
            reference_context=reference_context,
            rubrics=rubrics,
            max_marks=int(max_marks),
            question_type=question_type,
        )

        # Compute weighted predicted score ratio
        predicted_ratio = float(np.dot(feats, self.weights))

        # Scaling curve
        if predicted_ratio < 0.10:
            final_ratio = 0.0
        elif predicted_ratio > 0.82:
            final_ratio = 1.0
        else:
            final_ratio = (predicted_ratio - 0.10) / (0.82 - 0.10)

        raw_marks = final_ratio * max_marks
        marks_awarded = round(raw_marks * 2) / 2
        marks_awarded = max(0.0, min(max_marks, marks_awarded))
        is_correct = marks_awarded >= (max_marks * 0.85)

        # Feedback generation
        feedback_parts = []
        satisfied_count = sum(1 for r in rubric_results if r["is_satisfied"])
        total_rubrics = len(rubric_results)

        if final_ratio >= 0.85:
            feedback_parts.append("Excellent answer covering all core concepts comprehensively.")
        elif final_ratio >= 0.60:
            feedback_parts.append("Good response explaining the essential concepts.")
        elif final_ratio >= 0.35:
            feedback_parts.append("Partial answer. Several key points or details are missing.")
        else:
            feedback_parts.append("Answer lacks required depth and expected key concepts.")

        if total_rubrics > 0:
            feedback_parts.append(f"Rubrics matched: {satisfied_count} of {total_rubrics} key points.")
            missed = [r["point"] for r in rubric_results if not r["is_satisfied"]]
            if missed:
                feedback_parts.append(f"Consider addressing: {missed[0]}.")

        return {
            "marks_awarded": float(marks_awarded),
            "max_marks": float(max_marks),
            "percentage": round((marks_awarded / max_marks) * 100, 1),
            "is_correct": is_correct,
            "feedback": " ".join(feedback_parts),
            "reason": f"Sklearn TF-IDF Word Match: {round(float(feats[0]) * 100)}%, Char Match: {round(float(feats[1]) * 100)}%, Rubric Coverage: {round(float(feats[3]) * 100)}%.",
            "semantic_score": round(float(feats[0]), 3),
            "rubric_breakdown": rubric_results,
            "features": {name: round(float(val), 3) for name, val in zip(SklearnFeatureExtractor.FEATURE_NAMES, feats)},
            "method": "exmint_ml_sklearn",
        }


# Singleton instance
default_ml_grader = ExMintAIGrader()

def ml_grade_answer(
    question_text: str,
    expected_notes: str,
    student_answer: str,
    max_marks: int,
    reference_context: str = "",
    rubrics: Optional[List[Any]] = None,
    question_type: str = "long",
) -> Dict[str, Any]:
    return default_ml_grader.grade(
        question_text=question_text,
        student_answer=student_answer,
        max_marks=max_marks,
        expected_notes=expected_notes,
        reference_context=reference_context,
        rubrics=rubrics,
        question_type=question_type,
    )
