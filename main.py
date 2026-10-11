from fastapi import FastAPI
from pydantic import BaseModel
import pandas as pd
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
import joblib #type: ignore

ml_model = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    ml_model['model'] = joblib.load('credit_risk_nodel.pkl')
    ml_model['threshold'] = joblib.load('best_threshold.pkl') 
    
    
    yield
    
    ml_model.clear()
    
    
app = FastAPI(lifespan=lifespan)

class loan(BaseModel):
    person_age: int
    person_income: float
    person_home_ownership: str
    person_emp_length: float
    loan_intent: str
    loan_grade: str
    loan_amnt: float
    loan_int_rate: float
    loan_percent_income: float
    cb_person_default_on_file: str
    cb_person_cred_hist_length: int



@app.post('/predict')
def predict(data: loan):
    input_df = pd.DataFrame([data.dict()])

    probability = float(
        ml_model['model'].predict_proba(input_df)[0, 1]
    )

    threshold = float(ml_model['threshold'])

    prediction = int(probability >= threshold)

    return {
        "default_probability": probability,
        "default_prediction": prediction,
        "threshold": threshold,
        "Result": "High Risk" if prediction == 1 else "Low Risk"
    }

    
    

@app.get('/')
def home():
    return "this is home screen"


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",
        "http://127.0.0.1:5500",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)