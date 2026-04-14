import os
import logging
import re
from typing import List, Dict, Any
from langchain_community.document_loaders import PyPDFLoader, TextLoader, Docx2txtLoader
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_community.vectorstores import FAISS
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.chains import RetrievalQA
from langchain.prompts import PromptTemplate
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("StudyMind-RAG")

# Load OpenAI API Key from .env file
load_dotenv()

class RAGEngine:
    def __init__(self, vector_db_path: str = "vectordb"):
        self.vector_db_path = vector_db_path
        self.api_key = os.getenv("OPENAI_API_KEY")
        
        # Check if API Key exists
        if not self.api_key or self.api_key == "your_key_here":
            logger.warning("OPENAI_API_KEY is missing! Using Mock Mode or raising error on call.")
        
        self.embeddings = OpenAIEmbeddings() if self.api_key else None
        self.llm = ChatOpenAI(model="gpt-4o-mini", temperature=0) if self.api_key else None
        
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=600,
            chunk_overlap=100,
            separators=["\n\n", "\n", ".", " ", ""],
        )
        self.vector_store = None
        self._load_existing_store()

    def _load_existing_store(self):
        try:
            if os.path.exists(os.path.join(self.vector_db_path, "index.faiss")) and self.embeddings:
                self.vector_store = FAISS.load_local(
                    self.vector_db_path, 
                    self.embeddings,
                    allow_dangerous_deserialization=True
                )
                logger.info(f"Successfully loaded vector store from {self.vector_db_path}")
        except Exception as e:
            logger.error(f"Error loading existing vector store: {e}")

    def process_document(self, file_path: str) -> int:
        if not self.api_key or self.api_key == "your_key_here":
            logger.warning("DEMO MODE: Bypassing embedding generation.")
            return 42 # Meaning of life as a dummy chunk count
            
        logger.info(f"Processing document: {file_path}")
        
        # 1. Load document with specialized loaders
        try:
            if file_path.endswith('.pdf'):
                loader = PyPDFLoader(file_path)
            elif file_path.endswith('.docx'):
                loader = Docx2txtLoader(file_path)
            else:
                loader = TextLoader(file_path)
            
            documents = loader.load()
        except Exception as e:
            logger.error(f"Failed to load document {file_path}: {e}")
            raise RuntimeError(f"Document loading failed: {str(e)}")
        
        # 2. Chunk text
        chunks = self.text_splitter.split_documents(documents)
        logger.info(f"Document split into {len(chunks)} chunks.")
        
        # 3. Add to vector store
        try:
            if self.vector_store is None:
                self.vector_store = FAISS.from_documents(chunks, self.embeddings)
            else:
                self.vector_store.add_documents(chunks)
            
            # 4. Save local index for persistence
            os.makedirs(self.vector_db_path, exist_ok=True)
            self.vector_store.save_local(self.vector_db_path)
            return len(chunks)
        except Exception as e:
            logger.error(f"Failed to update vector store: {e}")
            raise RuntimeError(f"Vector storage failed: {str(e)}")

    def _keyword_search(self, query: str) -> Dict[str, Any]:
        """High-precision chunk-based search for No-API Mode"""
        logger.info(f"Running Chunked Keyword Search for: {query}")
        
        upload_dir = "uploads"
        if not os.path.exists(upload_dir) or not os.listdir(upload_dir):
            return {"answer": "No notes found. Please upload a PDF or TXT file to start searching!", "sources": []}
            
        all_chunks = []
        for filename in os.listdir(upload_dir):
            if filename.endswith(('.pdf', '.txt', '.docx')):
                path = os.path.join(upload_dir, filename)
                try:
                    if path.endswith('.pdf'): loader = PyPDFLoader(path)
                    elif path.endswith('.docx'): loader = Docx2txtLoader(path)
                    else: loader = TextLoader(path)
                    
                    docs = loader.load()
                    # Use the same professional splitter as the RAG engine
                    chunks = self.text_splitter.split_documents(docs)
                    for c in chunks:
                        all_chunks.append({"text": c.page_content, "source": filename})
                except: continue

        if not all_chunks:
            return {"answer": "I couldn't index your files. Try standard formats.", "sources": []}

        query_words = set(re.findall(r'\w+', query.lower()))
        if not query_words: return {"answer": "Please enter a search topic.", "sources": []}
        
        scored_chunks = []
        for chunk in all_chunks:
            text_lower = chunk["text"].lower()
            # Calculate match frequency for relevance
            matches = sum(1 for word in query_words if word in text_lower)
            if matches > 0:
                scored_chunks.append({
                    "text": chunk["text"], 
                    "source": chunk["source"], 
                    "score": matches
                })

        # Sort by relevance
        scored_chunks.sort(key=lambda x: x["score"], reverse=True)

        if scored_chunks:
            # Aggregate top 2 best segments for a full answer
            top_hits = []
            seen = set()
            for hit in scored_chunks:
                # Basic deduplication
                excerpt = hit["text"][:100]
                if excerpt not in seen:
                    top_hits.append(hit)
                    seen.add(excerpt)
                if len(top_hits) >= 2: break

            combined_answer = "\n\n".join([f"{h['text']}" for h in top_hits])
            sources = [{"page": "N/A", "source": h["source"]} for h in top_hits]
            
            return {
                "answer": combined_answer,
                "sources": sources
            }
        
        return {
            "answer": "Not found in your current notes. Try searching for specific technical terms.",
            "sources": []
        }

    def ask_question(self, query: str) -> Dict[str, Any]:
        # If API key is missing, use keyword search
        if not self.api_key or self.api_key == "your_key_here":
            return self._keyword_search(query)
            
        if self.vector_store is None:
            return {
                "answer": "I don't have any notes in my archive yet. Please upload a document so I can help you!",
                "sources": []
            }
        
        # Strict Prompt to prevent Hallucination
        prompt_template = """
        You are 'StudyMind AI', a specialized assistant for student notes.
        Your task is to answer questions strictly using the provided context blocks.
        
        Context: {context}
        
        Question: {question}
        
        Final Answer:"""
        
        QA_PROMPT = PromptTemplate(
            template=prompt_template, input_variables=["context", "question"]
        )
        
        try:
            qa_chain = RetrievalQA.from_chain_type(
                llm=self.llm,
                chain_type="stuff",
                retriever=self.vector_store.as_retriever(search_kwargs={"k": 5}),
                return_source_documents=True,
                chain_type_kwargs={"prompt": QA_PROMPT}
            )
            
            result = qa_chain.invoke({"query": query})
            
            sources = [
                {"page": doc.metadata.get("page", "N/A"), "source": os.path.basename(doc.metadata.get("source", "unknown"))}
                for doc in result["source_documents"]
            ]
            
            return {
                "answer": result["result"],
                "sources": sources
            }
        except Exception as e:
            logger.error(f"RAG query failed: {e}")
            return self._keyword_search(query) # Fallback to keyword search on API error
                                                                    