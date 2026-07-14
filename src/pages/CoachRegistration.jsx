import React from 'react';
import RegisterCoachForm from '../components/RegisterCoachForm';

const CoachRegistration = () => (
    <div className="min-h-screen pt-32 pb-20 bg-[#0A0D14] relative overflow-hidden">
        <div className="absolute top-40 left-0 w-[500px] h-[500px] bg-padel-green/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="max-w-lg mx-auto px-4 relative z-10">
            <div className="text-center mb-8">
                <h1 className="text-4xl font-bold text-white mb-3 uppercase">
                    Coach <span className="text-padel-green">Registration</span>
                </h1>
                <p className="text-gray-400 text-sm">Join our network of approved 4M Padel coaches.</p>
            </div>
            <div className="bg-[#1a1a1a]/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl">
                <RegisterCoachForm onClose={() => { window.location.href = '/'; }} />
            </div>
        </div>
    </div>
);

export default CoachRegistration;
