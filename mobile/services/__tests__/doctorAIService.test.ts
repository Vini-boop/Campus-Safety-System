/**
 * Doctor AI Service Tests
 * Verify rule-based logic works correctly
 */

import DoctorAIService from '../doctorAIService';

describe('DoctorAIService', () => {
    let service: DoctorAIService;

    beforeEach(() => {
        service = DoctorAIService.getInstance();
        service.resetConversation();
    });

    describe('Initial Greeting', () => {
        it('should start with greeting stage', () => {
            const response = service.processUserInput('start');
            expect(response.stage).toBe('greeting');
            expect(response.lines.length).toBe(1);
            expect(response.lines[0]).toContain('Medical Center');
        });
    });

    describe('Minimum Keyword Requirement', () => {
        it('should ask for more details with only 1 keyword', () => {
            service.processUserInput('start');
            service.processUserInput('consultation');

            const response = service.processUserInput('I have a headache');

            expect(response.stage).toBe('consultation');
            expect(response.lines[0]).toContain('need a few more details');
        });

        it('should diagnose with 2+ keywords', () => {
            service.processUserInput('start');
            service.processUserInput('consultation');

            const response = service.processUserInput('I have fever and headache');

            expect(response.stage).toBe('analysis');
            expect(response.lines.length).toBe(1); // ONE consolidated message
            expect(response.lines[0]).toContain('🩺');
            expect(response.lines[0]).toContain('💊');
        });
    });

    describe('Consolidated Response', () => {
        it('should return ONE message with all sections', () => {
            service.processUserInput('start');
            service.processUserInput('consultation');

            const response = service.processUserInput('I have fever and chills');

            expect(response.lines.length).toBe(1);

            const message = response.lines[0];
            expect(message).toContain('🩺'); // Diagnosis
            expect(message).toContain('💊'); // Advice
            expect(message).toContain('⚠️'); // Warnings
            expect(message).toContain('🚨'); // Escalation
            expect(message).toContain('📞'); // Contact
            expect(message).toContain('👨‍⚕️'); // Disclaimer
            expect(message).toContain('Is there anything else'); // Closing
        });
    });

    describe('FSM Stage Progression', () => {
        it('should move from consultation to closing after diagnosis', () => {
            service.processUserInput('start');
            service.processUserInput('consultation');
            service.processUserInput('I have fever and headache');

            expect(service.getCurrentStage()).toBe('closing');
        });

        it('should not repeat analysis in closing stage', () => {
            service.processUserInput('start');
            service.processUserInput('consultation');
            service.processUserInput('I have fever and headache');

            const response = service.processUserInput('thank you');

            expect(response.lines[0]).not.toContain('🩺');
            expect(response.lines[0]).toContain('anything else');
        });

        it('should allow new consultation from closing', () => {
            service.processUserInput('start');
            service.processUserInput('consultation');
            service.processUserInput('I have fever and headache');

            const response = service.processUserInput('yes, I have another question');

            expect(response.stage).toBe('consultation');
            expect(response.lines[0]).toContain('describe your symptoms');
        });
    });

    describe('Emergency Detection', () => {
        it('should bypass normal flow for emergencies', () => {
            const response = service.processUserInput("I can't breathe");

            expect(response.stage).toBe('analysis');
            expect(response.isComplete).toBe(true);
            expect(response.lines[0]).toContain('🚨 MEDICAL EMERGENCY');
        });
    });

    describe('Symptom Conditions', () => {
        it('should diagnose malaria with fever + chills', () => {
            service.processUserInput('start');
            service.processUserInput('consultation');

            const response = service.processUserInput('I have fever and chills');

            expect(response.lines[0]).toContain('Malaria');
        });

        it('should diagnose cold/flu with cough + runny nose', () => {
            service.processUserInput('start');
            service.processUserInput('consultation');

            const response = service.processUserInput('I have cough and runny nose');

            expect(response.lines[0]).toContain('Cold or Flu');
        });

        it('should diagnose pneumonia with chest pain + difficulty breathing', () => {
            service.processUserInput('start');
            service.processUserInput('consultation');

            const response = service.processUserInput('I have chest pain and difficulty breathing');

            expect(response.lines[0]).toContain('Pneumonia');
            expect(response.lines[0]).toContain('IMMEDIATELY');
        });
    });
});
