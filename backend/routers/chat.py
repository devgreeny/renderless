"""
Chat endpoint for conversational render assistant.
Uses GPT-4 to interview users and build detailed prompts.
"""

from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from openai import OpenAI
from config import settings

router = APIRouter(prefix="/api", tags=["chat"])


class GatheredInfo(BaseModel):
    """Information gathered through the conversation."""
    intent: Optional[str] = None
    targetDescription: Optional[str] = None
    replacementDescription: Optional[str] = None
    style: Optional[str] = None
    additionalDetails: Optional[list[str]] = None


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    gathered_info: GatheredInfo
    user_input: str
    image_analysis: Optional[str] = None
    generation_count: int = 0
    render_mode: str = "plan_to_render"  # 'plan_to_render' or 'pretty_render'


class ChatResponse(BaseModel):
    message: str
    action: Optional[str] = None  # 'confirm_generate' when ready
    updated_info: Optional[dict] = None
    final_prompt: Optional[str] = None


# System prompt for the conversation AI
SYSTEM_PROMPT = """You are a professional architectural visualization assistant helping users create renders from photos.

You MUST respond with valid JSON format.

## YOUR ROLE

Help users describe what they want, then create detailed prompts for the image generation model.

## TWO RENDER MODES

### PLAN TO RENDER MODE
Transform architectural drawings/plans into realistic renders while keeping EVERYTHING accurate:
- Exact same camera angle, perspective, scale
- Same building geometry, massing, window placement
- Same site layout and proportions
- Just enhance visual quality and make it photorealistic

### PRETTY RENDER MODE  
Create polished marketing renders with creative freedom:
- Can adjust composition for better visual impact
- Add atmospheric elements (people, landscaping, dramatic lighting)
- Focus on storytelling and emotional appeal
- Still represents the same project, but optimized for marketing

## RESPONSE FORMAT

Always respond with this JSON structure:
{
    "message": "Your conversational response to the user",
    "action": null or "confirm_generate",
    "updated_info": {
        "intent": "transform|add|remove|modify",
        "replacementDescription": "what to change or add",
        "style": "any style notes"
    },
    "final_prompt": null or "the complete prompt when ready to generate"
}

## CONVERSATION FLOW

1. If user says just "render" or "go" or similar minimal input:
   - Immediately set action: "confirm_generate"
   - Generate appropriate final_prompt based on render_mode

2. If user describes changes they want:
   - Acknowledge and confirm understanding
   - Ask for any missing critical details
   - When ready, set action: "confirm_generate" with final_prompt

3. Keep conversations SHORT - users want quick results

## PROMPT CONSTRUCTION

For PLAN_TO_RENDER mode, the final_prompt should emphasize:
- "Keep exact same camera angle, perspective, geometry"
- "Maintain all architectural details precisely"
- "Transform to photorealistic render while preserving accuracy"
- Any specific changes the user requested

For PRETTY_RENDER mode, the final_prompt should emphasize:
- "Create stunning marketing visualization"
- "Optimize for visual impact and emotional appeal"
- "Professional architectural photography quality"
- "Add life and atmosphere"
- Any specific changes the user requested

## EXAMPLES

User (plan_to_render): "render"
Response:
{
    "message": "Creating an accurate render of your plan. Keeping all geometry and details exact while making it photorealistic.",
    "action": "confirm_generate",
    "updated_info": {"intent": "transform"},
    "final_prompt": "Transform this architectural plan/photo into a photorealistic render. Preserve the EXACT camera angle, perspective, building geometry, window placement, and site layout. Enhance to look like a professional architectural photograph with clear lighting, sharp details, and realistic materials. Do not modify any architectural elements or proportions."
}

User (pretty_render): "render"
Response:
{
    "message": "Creating a polished marketing render with some creative enhancements for visual impact.",
    "action": "confirm_generate", 
    "updated_info": {"intent": "transform"},
    "final_prompt": "Create a stunning marketing visualization of this project. Capture the essence while optimizing for visual impact. Add professional architectural photography quality with dramatic lighting, atmospheric depth, and aspirational appeal. The result should look like a premium real estate marketing render that tells a compelling story."
}

User: "add some landscaping and people"
Response:
{
    "message": "I'll add professional landscaping and people to bring life to the scene. Generating now!",
    "action": "confirm_generate",
    "updated_info": {"intent": "add", "replacementDescription": "landscaping and people"},
    "final_prompt": "Add professional landscaping with mature trees, well-maintained shrubs, and seasonal flowers. Include a few well-dressed people naturally placed to add scale and life to the scene. Maintain the architectural accuracy while creating an inviting, lived-in atmosphere."
}
"""


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Process a chat message and return AI response with gathered information.
    """
    if not settings.openai_api_key:
        raise HTTPException(status_code=500, detail="OpenAI API not configured")
    
    try:
        client = OpenAI(api_key=settings.openai_api_key)
        
        # Build the conversation for GPT
        conversation = [{"role": "system", "content": SYSTEM_PROMPT}]
        
        # Add render mode context
        mode_context = "PLAN_TO_RENDER" if request.render_mode == "plan_to_render" else "PRETTY_RENDER"
        conversation.append({
            "role": "system",
            "content": f"""CURRENT STATE:
- render_mode: {mode_context}
- generation_count: {request.generation_count}
- This is {'the FIRST render' if request.generation_count == 0 else 'a subsequent edit'}

Use the {mode_context} approach for building prompts."""
        })
        
        # Add any previous messages for context
        for msg in request.messages[-4:]:  # Last 4 messages for context
            conversation.append({"role": msg.role, "content": msg.content})
        
        # Handle START_CONVERSATION
        if request.user_input == "START_CONVERSATION":
            # Return a simple greeting based on mode
            if request.render_mode == "plan_to_render":
                return ChatResponse(
                    message="Ready to create an accurate render of your plan. Describe any changes you'd like, or just say \"render\" to transform as-is.",
                    action=None,
                    updated_info=None,
                    final_prompt=None
                )
            else:
                return ChatResponse(
                    message="Ready to create a stunning marketing render! Describe any additions or changes you'd like, or say \"render\" to let me work my magic.",
                    action=None,
                    updated_info=None,
                    final_prompt=None
                )
        
        # Add current user input
        conversation.append({
            "role": "user",
            "content": f"""User said: "{request.user_input}"

Current gathered info: {request.gathered_info.model_dump()}

Respond with appropriate JSON. If user wants to render now (says "render", "go", "generate", etc.), include action: "confirm_generate" with final_prompt."""
        })
        
        # Get GPT response
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=conversation,
            response_format={"type": "json_object"},
            temperature=0.7,
            max_tokens=1000
        )
        
        content = response.choices[0].message.content
        
        import json
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            return ChatResponse(
                message="I understand. Would you like me to proceed with rendering?",
                action=None,
                updated_info=None,
                final_prompt=None
            )
        
        return ChatResponse(
            message=data.get("message", "Ready when you are!"),
            action=data.get("action"),
            updated_info=data.get("updated_info"),
            final_prompt=data.get("final_prompt")
        )
        
    except Exception as e:
        print(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
