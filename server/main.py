from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import shutil
import logging
from typing import List, Optional, Dict, Any
from engine import RAGEngine

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("StudyMind-API")

app = FastAPI(title="StudyMind AI - Backend", version="2.0.0")

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize RAG Engine
try:
    engine = RAGEngine()
    logger.info("Initializing StudyMind RAG Engine...")
except Exception as e:
    logger.error(f"Critical Engine Initialization Failure: {e}")
    # Don't crash immediately, but mark as unavailable
    engine = None

class ChatQuery(BaseModel):
    query: str
    doc_ids: Optional[List[str]] = None

@app.get("/")
async def root():
    logger.info("Health check received.")
    return {
        "status": "online",
        "service": "StudyMind RAG Engine",
        "engine_ready": engine is not None,
        "api_key_set": os.getenv("OPENAI_API_KEY") is not None and os.getenv("OPENAI_API_KEY") != "your_key_here"
    }

@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    if not engine:
        raise HTTPException(status_code=503, detail="RAG Engine not initialized.")
        
    if not file.filename.lower().endswith(('.pdf', '.txt', '.docx')):
        raise HTTPException(status_code=400, detail="Unsupported file format. Use PDF, TXT or DOCX.")
    
    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename)
    
    logger.info(f"Uploading file: {file.filename}")
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Process document through the engine
        num_chunks = engine.process_document(file_path)
        logger.info(f"Successfully processed {file.filename} into {num_chunks} chunks.")
        
        return {
            "filename": file.filename,
            "status": "indexed",
            "chunks": num_chunks,
            "success": True
        }
    except Exception as e:
        logger.error(f"Document processing failed: {e}")
        # Clean up failed file upload if it exists
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@app.post("/chat")
async def chat_query(query_data: ChatQuery):
    if not engine:
        raise HTTPException(status_code=503, detail="RAG Engine not initialized.")
        
    logger.info(f"Received query: {query_data.query}")
    
    try:
        response = engine.ask_question(query_data.query)
        logger.info("Answer generated successfully.")
        return response
    except Exception as e:
        logger.error(f"Chat execution failed: {e}")
        error_msg = str(e)
        if "api_key" in error_msg.lower():
            error_msg = "AUTHENTICATION_ERROR: Missing or Invalid OpenAI API Key."
        raise HTTPException(status_code=500, detail=error_msg)

if __name__ == "__main__":
    import uvicorn
    # Log the server initialization
    logger.info("StudyMind Backend spinning up on port 8000...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
